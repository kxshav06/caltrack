/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Gender = 'male' | 'female';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type FitnessGoal = 'lose' | 'maintain' | 'gain';

export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'inch';

export interface UserProfile {
  name: string;
  age: number;
  gender: Gender;
  height: number; // Stored in cm
  weight: number; // Stored in kg
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
  dailyCalorieTarget: number;
  macroTargets: {
    protein: number; // grams
    carbs: number;   // grams
    fat: number;     // grams
  };
  units: {
    weight: WeightUnit;
    height: HeightUnit;
  };
  onboarded: boolean;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodLog {
  id: string;
  name: string;
  calories: number;
  protein: number; // grams
  carbs: number;   // grams
  fat: number;     // grams
  portion: string;
  imageUrl?: string;
  timestamp: number; // epoch ms
  mealType: MealType;
}

export type IntensityLevel = 'low' | 'moderate' | 'high';

export interface ActivityLog {
  id: string;
  activityType: string;
  durationMinutes: number;
  intensity: IntensityLevel;
  caloriesBurned: number;
  timestamp: number; // epoch ms
  steps?: number;
}

export interface WeightLog {
  id: string;
  weight: number; // Stored in kg
  timestamp: number; // epoch ms
}
