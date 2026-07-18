/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  getOrCreateUser,
  getUserProfile,
  updateUserProfile,
  getFoodLogs,
  addFoodLog,
  deleteFoodLog,
  getActivityLogs,
  addActivityLog,
  deleteActivityLog,
  getWeightLogs,
  addWeightLog,
  deleteWeightLog,
} from './src/db/queries.ts';

dotenv.config();

// Helper to format raw database user rows back to standard UserProfile structure
function formatProfile(dbUser: any) {
  if (!dbUser) return null;
  return {
    name: dbUser.name || '',
    age: dbUser.age || 0,
    gender: dbUser.gender || 'male',
    height: dbUser.height || 0,
    weight: dbUser.weight || 0,
    activityLevel: dbUser.activityLevel || 'sedentary',
    goal: dbUser.goal || 'maintain',
    dailyCalorieTarget: dbUser.dailyCalorieTarget || 2000,
    macroTargets: {
      protein: dbUser.macroProtein || 0,
      carbs: dbUser.macroCarbs || 0,
      fat: dbUser.macroFat || 0,
    },
    units: {
      weight: dbUser.unitWeight || 'kg',
      height: dbUser.unitHeight || 'cm',
    },
    onboarded: dbUser.onboarded || false,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up API routes FIRST before static or Vite middleware
  app.use(express.json({ limit: '12mb' }));

  // Food Analysis Endpoint using multimodal Gemini API
  app.post('/api/analyze-food', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: 'Image data is required' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(500).json({
          error: 'Gemini API key is not configured. Please add GEMINI_API_KEY to your Secrets panel under Settings.'
        });
      }

      // Initialize server-side Gemini client
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Extract raw base64 data without prefix if present
      const cleanBase64 = imageBase64.includes('base64,') 
        ? imageBase64.split('base64,')[1] 
        : imageBase64;

      const cleanMimeType = mimeType || 'image/jpeg';

      const prompt = `Analyze this food image to identify the item(s) present and estimate their portion sizes and nutritional values. 
Provide your best objective health estimations. If the image does not seem to contain food, make a fallback estimate or return what you see with a confidence rating and describe the item honestly.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: cleanBase64
              }
            },
            {
              text: prompt
            }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              foodName: {
                type: Type.STRING,
                description: 'The identified food dish name or item name'
              },
              estimatedCalories: {
                type: Type.INTEGER,
                description: 'Estimated calorie content in kilocalories (kcal) for the observed portion'
              },
              protein: {
                type: Type.NUMBER,
                description: 'Estimated protein content in grams (g)'
              },
              carbs: {
                type: Type.NUMBER,
                description: 'Estimated total carbohydrates in grams (g)'
              },
              fat: {
                type: Type.NUMBER,
                description: 'Estimated total fat content in grams (g)'
              },
              portion: {
                type: Type.STRING,
                description: 'Estimated portion description (e.g., "1 medium bowl, approx 300g", "2 slices", "1 standard apple")'
              },
              confidence: {
                type: Type.NUMBER,
                description: 'Confidence score of the identification and nutrient estimate from 0.0 to 1.0'
              },
              explanation: {
                type: Type.STRING,
                description: 'A brief description of what ingredients you recognized to make this estimation'
              }
            },
            required: ['foodName', 'estimatedCalories', 'protein', 'carbs', 'fat', 'portion', 'confidence']
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('No content returned from Gemini model');
      }

      const parsedJSON = JSON.parse(responseText.trim());
      return res.json(parsedJSON);

    } catch (err: any) {
      console.error('Error in analyze-food endpoint:', err);
      return res.status(500).json({ 
        error: err.message || 'Failed to analyze food image' 
      });
    }
  });

  // --- Secure Users & Profiles API ---

  // Sync user at login
  app.post('/api/users/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || '';
      const user = await getOrCreateUser(uid, email);
      return res.json({ status: 'ok', user: formatProfile(user) });
    } catch (err: any) {
      console.error('Error syncing user:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Get current user profile
  app.get('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const user = await getUserProfile(uid);
      return res.json(formatProfile(user));
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Update/Save profile
  app.post('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const updated = await updateUserProfile(uid, req.body);
      return res.json(formatProfile(updated));
    } catch (err: any) {
      console.error('Error updating profile:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // --- Secure Food Logs API ---

  app.get('/api/food-logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const logs = await getFoodLogs(uid);
      return res.json(logs);
    } catch (err: any) {
      console.error('Error fetching food logs:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/food-logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const log = await addFoodLog(uid, req.body);
      return res.json(log);
    } catch (err: any) {
      console.error('Error adding food log:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/food-logs/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const id = req.params.id;
      const result = await deleteFoodLog(uid, id);
      if (!result) {
        return res.status(404).json({ error: 'Food log not found' });
      }
      return res.json({ status: 'success', deleted: result });
    } catch (err: any) {
      console.error('Error deleting food log:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // --- Secure Activity Logs API ---

  app.get('/api/activity-logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const logs = await getActivityLogs(uid);
      return res.json(logs);
    } catch (err: any) {
      console.error('Error fetching activity logs:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/activity-logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const log = await addActivityLog(uid, req.body);
      return res.json(log);
    } catch (err: any) {
      console.error('Error adding activity log:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/activity-logs/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const id = req.params.id;
      const result = await deleteActivityLog(uid, id);
      if (!result) {
        return res.status(404).json({ error: 'Activity log not found' });
      }
      return res.json({ status: 'success', deleted: result });
    } catch (err: any) {
      console.error('Error deleting activity log:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // --- Secure Weight Logs API ---

  app.get('/api/weight-logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const logs = await getWeightLogs(uid);
      return res.json(logs);
    } catch (err: any) {
      console.error('Error fetching weight logs:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/weight-logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const log = await addWeightLog(uid, req.body);
      return res.json(log);
    } catch (err: any) {
      console.error('Error adding weight log:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/weight-logs/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const id = req.params.id;
      const result = await deleteWeightLog(uid, id);
      if (!result) {
        return res.status(404).json({ error: 'Weight log not found' });
      }
      return res.json({ status: 'success', deleted: result });
    } catch (err: any) {
      console.error('Error deleting weight log:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
  });

  // Vite integration for asset serving & fallback SPA routing
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Direct SPA fallback using Express static server routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CalTrack server listening on http://localhost:${PORT}`);
  });
}

startServer();
