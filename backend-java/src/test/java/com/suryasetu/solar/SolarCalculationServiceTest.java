package com.suryasetu.solar;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.suryasetu.solar.dto.ApiDtos.AdminRuleDto;
import com.suryasetu.solar.dto.ApiDtos.LeadEvaluationRequest;
import com.suryasetu.solar.dto.ApiDtos.LeadScoringOutputDto;
import com.suryasetu.solar.dto.ApiDtos.QuotationCalculateRequest;
import com.suryasetu.solar.dto.ApiDtos.QuotationCalculateResponse;
import com.suryasetu.solar.service.SolarCalculationService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SolarCalculationServiceTest {

  private final SolarCalculationService service = new SolarCalculationService();

  @Test
  void evaluatesHighScoreNagpurOwnerAndSizesPlantDeterministically() {
    LeadScoringOutputDto score = service.evaluateLeadQualification(new LeadEvaluationRequest(
        "OWNER",
        3800.0,
        450.0,
        4.0,
        "440010",
        360.0,
        "RCC",
        1400.0,
        false
    ));

    assertEquals("HIGH", score.category());
    assertEquals(3.0, score.recommendedCapacityKw());
    assertEquals("SURVEY_SCHEDULED", score.suggestedSurveyStatus());
    assertTrue(score.totalScore() >= 75);
  }

  @Test
  void routesTenantEnquiryToPhoneQualificationCallInsteadOfRejection() {
    LeadScoringOutputDto score = service.evaluateLeadQualification(new LeadEvaluationRequest(
        "TENANT",
        3200.0,
        400.0,
        3.0,
        "440012",
        310.0,
        "RCC",
        1400.0,
        false
    ));

    assertEquals("LOW", score.category());
    assertEquals(0.0, score.recommendedCapacityKw());
    assertEquals("HOLD_TENANT_CONSENT", score.suggestedSurveyStatus());
  }

  @Test
  void computesSubsidyCapAndFourOptionComparisonDeterministically() {
    List<AdminRuleDto> rules = List.of(
        new AdminRuleDto(
            "r1", "SOLAR_OPTION", "global", "550Wp TOPCon", "PANEL_TOPCON_550", 1,
            "2024-01-01", "2028-12-31", true,
            Map.of("pricePerKwInr", 52000, "annualGenPerKw", 1400), "", "admin"
        ),
        new AdminRuleDto(
            "r2", "SUBSIDY_RULE", "global", "Residential Subsidy", "RES_SAMPLE_SLAB", 1,
            "2024-01-01", "2028-12-31", true,
            Map.of(
                "firstTierMaxKw", 2,
                "firstTierRateInr", 30000,
                "secondTierMaxKw", 3,
                "secondTierRateInr", 18000,
                "maxSubsidyCapInr", 78000,
                "residentialOnly", true
            ), "", "admin"
        ),
        new AdminRuleDto(
            "r3", "PRICING_RULE", "global", "EPC Standard", "EPC_VIDARBHA_STD", 1,
            "2024-01-01", "2028-12-31", true,
            Map.of("installationPerKwInr", 8500, "bosFlatInr", 12000, "annualGenPerKw", 1400, "selfConsumptionRatio", 1.0),
            "", "admin"
        ),
        new AdminRuleDto(
            "r4", "ELECTRICITY_TARIFF", "global", "MSEDCL LT-I", "MSEDCL_LT1_RES", 1,
            "2024-01-01", "2028-12-31", true,
            Map.of("tariffPerUnitInr", 9.2), "", "admin"
        )
    );

    QuotationCalculateResponse res = service.calculateQuotationBundle(new QuotationCalculateRequest(
        "2026-11-04", 3.0, 4.0, "OWNER", true,
        "PANEL_TOPCON_550", "MSEDCL_LT1_RES", 0.0, 0.0, rules
    ));

    // 3 kW * 1,400 units/kW = 4,200 units/year
    assertEquals(4200, res.calculation().annualGenerationUnits());
    // 2 kW * 30,000 + 1 kW * 18,000 = ₹78,000 cap
    assertEquals(78000, res.calculation().applicableSubsidyInr());
    // 1 kW, 2 kW, 3 kW, and 4 kW Recommended Alternative
    assertEquals(4, res.comparisonOptions().size());
    assertEquals(4.0, res.comparisonOptions().get(3).systemCapacityKw());
  }
}
