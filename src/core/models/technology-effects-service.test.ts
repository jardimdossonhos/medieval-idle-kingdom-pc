import { describe, it, expect } from "vitest";
import { calculateTechnologyBonuses, getTechnologyBonus } from "./technology-effects-service";
import type { TechnologyState } from "../models/technology";
import { TechnologyDomain } from "../models/enums";

describe("Technology Effects Service", () => {
  describe("calculateTechnologyBonuses", () => {
    it("should return an empty map for a kingdom with no technologies", () => {
      const state: TechnologyState = {
        unlocked: [],
        activeResearchId: null,
        researchFocus: TechnologyDomain.Economy,
        researchGoalId: null,
        accumulatedResearch: 0
      };

      const bonuses = calculateTechnologyBonuses(state);
      expect(bonuses.size).toBe(0);
    });

    it("should return the correct bonus for a single unlocked technology", () => {
      const state: TechnologyState = {
        unlocked: ["agri_basics"], // +0.1 food_production_multiplier, +0.05 growth_rate_multiplier
        activeResearchId: null,
        researchFocus: TechnologyDomain.Economy,
        researchGoalId: null,
        accumulatedResearch: 0
      };

      const bonuses = calculateTechnologyBonuses(state);

      expect(bonuses.size).toBe(2);
      expect(bonuses.get("economy.food_production_multiplier")).toBeCloseTo(0.1);
      expect(bonuses.get("population.growth_rate_multiplier")).toBeCloseTo(0.05);
    });

    it("should correctly sum bonuses from multiple technologies", () => {
      const state: TechnologyState = {
        unlocked: ["agri_basics", "crop_rotation"],
        activeResearchId: null,
        researchFocus: TechnologyDomain.Economy,
        researchGoalId: null,
        accumulatedResearch: 0
      };

      // agri_basics: +0.1 food_production_multiplier, +0.05 growth_rate_multiplier
      // crop_rotation: +0.15 food_production_multiplier, +0.05 tax_income_multiplier
      const bonuses = calculateTechnologyBonuses(state);

      expect(bonuses.size).toBe(3);
      expect(bonuses.get("economy.food_production_multiplier")).toBeCloseTo(0.1 + 0.15);
      expect(bonuses.get("population.growth_rate_multiplier")).toBeCloseTo(0.05);
      expect(bonuses.get("economy.tax_income_multiplier")).toBeCloseTo(0.05);
    });

    it("should handle additive and multiplier effects correctly", () => {
      const state: TechnologyState = {
        unlocked: ["trade_charters", "provincial_courts"],
        activeResearchId: null,
        researchFocus: TechnologyDomain.Economy,
        researchGoalId: null,
        accumulatedResearch: 0
      };

      // trade_charters: +0.15 trade_income_multiplier, +5 stability_additive
      // provincial_courts: +10 stability_additive, +10 administration.capacity_additive
      const bonuses = calculateTechnologyBonuses(state);

      expect(bonuses.size).toBe(3);
      expect(bonuses.get("economy.trade_income_multiplier")).toBeCloseTo(0.15);
      expect(bonuses.get("stability_additive")).toBeCloseTo(5 + 10);
      expect(bonuses.get("administration.capacity_additive")).toBeCloseTo(10);
    });

    it("should return an empty map if unlocked technology IDs are invalid", () => {
      const state: TechnologyState = {
        unlocked: ["invalid_tech_id", "another_one"],
        activeResearchId: null,
        researchFocus: TechnologyDomain.Economy,
        researchGoalId: null,
        accumulatedResearch: 0
      };

      const bonuses = calculateTechnologyBonuses(state);
      expect(bonuses.size).toBe(0);
    });
  });

  describe("getTechnologyBonus", () => {
    it("should return the correct value for an existing key", () => {
      const bonuses = new Map<string, number>([
        ["economy.food_production_multiplier", 0.25],
        ["stability_additive", 15]
      ]);

      const value = getTechnologyBonus(bonuses, "stability_additive");
      expect(value).toBe(15);
    });

    it("should return the default value (0) for a non-existing key", () => {
      const bonuses = new Map<string, number>([["economy.food_production_multiplier", 0.25]]);

      const value = getTechnologyBonus(bonuses, "military.manpower_recovery_multiplier");
      expect(value).toBe(0);
    });

    it("should return a custom default value for a non-existing key", () => {
      const bonuses = new Map<string, number>();
      const value = getTechnologyBonus(bonuses, "some_key", 1);
      expect(value).toBe(1);
    });
  });
});
