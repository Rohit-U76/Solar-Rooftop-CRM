package com.suryasetu.solar.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.suryasetu.solar.entity.AdminConfigRuleEntity;
import com.suryasetu.solar.repository.AdminConfigRuleRepository;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DataInitializer {

  private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

  @Bean
  public CommandLineRunner seedDefaultAdminRules(
      AdminConfigRuleRepository ruleRepository,
      ObjectMapper objectMapper
  ) {
    return args -> {
      if (ruleRepository.count() > 0) {
        return;
      }

      AdminConfigRuleEntity subsidy = new AdminConfigRuleEntity();
      subsidy.setId("rule_res_sample_slab_v1");
      subsidy.setRuleCategory("SUBSIDY_RULE");
      subsidy.setWorkspaceScope("global");
      subsidy.setTitle("PM Surya Ghar Residential Rooftop Subsidy Slab");
      subsidy.setCode("RES_SAMPLE_SLAB");
      subsidy.setVersionNumber(1);
      subsidy.setEffectiveFrom("2024-01-01");
      subsidy.setEffectiveTo("2028-12-31");
      subsidy.setActive(true);
      subsidy.setParametersJson(objectMapper.writeValueAsString(Map.of(
          "firstTierMaxKw", 2,
          "firstTierRateInr", 30000,
          "secondTierMaxKw", 3,
          "secondTierRateInr", 18000,
          "maxSubsidyCapInr", 78000,
          "residentialOnly", true
      )));
      subsidy.setNotes("₹30,000/kW up to 2 kW + ₹18,000/kW up to 3 kW, capped at ₹78,000 for residential owners.");
      subsidy.setCreatedByUid("system-bootstrap");
      ruleRepository.save(subsidy);

      AdminConfigRuleEntity panel = new AdminConfigRuleEntity();
      panel.setId("rule_panel_topcon_550_v1");
      panel.setRuleCategory("SOLAR_OPTION");
      panel.setWorkspaceScope("global");
      panel.setTitle("550Wp TOPCon Bifacial + MPPT String Inverter");
      panel.setCode("PANEL_TOPCON_550");
      panel.setVersionNumber(1);
      panel.setEffectiveFrom("2024-01-01");
      panel.setEffectiveTo("2028-12-31");
      panel.setActive(true);
      panel.setParametersJson(objectMapper.writeValueAsString(Map.of(
          "pricePerKwInr", 52000,
          "annualGenPerKw", 1400,
          "warrantyYears", 25
      )));
      panel.setNotes("ALMM-listed N-Type TOPCon modules rated for Vidarbha ambient temperatures.");
      panel.setCreatedByUid("system-bootstrap");
      ruleRepository.save(panel);

      AdminConfigRuleEntity pricing = new AdminConfigRuleEntity();
      pricing.setId("rule_epc_vidarbha_std_v1");
      pricing.setRuleCategory("PRICING_RULE");
      pricing.setWorkspaceScope("global");
      pricing.setTitle("Vidarbha Standard EPC Turnkey Installation & BOS");
      pricing.setCode("EPC_VIDARBHA_STD");
      pricing.setVersionNumber(1);
      pricing.setEffectiveFrom("2024-01-01");
      pricing.setEffectiveTo("2028-12-31");
      pricing.setActive(true);
      pricing.setParametersJson(objectMapper.writeValueAsString(Map.of(
          "installationPerKwInr", 8500,
          "bosFlatInr", 12000,
          "annualGenPerKw", 1400,
          "selfConsumptionRatio", 1.0
      )));
      pricing.setNotes("Includes hot-dip galvanized structure, ACDB/DCDB, earthing, LA, and MSEDCL net-meter liaison.");
      pricing.setCreatedByUid("system-bootstrap");
      ruleRepository.save(pricing);

      AdminConfigRuleEntity tariff = new AdminConfigRuleEntity();
      tariff.setId("rule_msedcl_lt1_res_v1");
      tariff.setRuleCategory("ELECTRICITY_TARIFF");
      tariff.setWorkspaceScope("global");
      tariff.setTitle("MSEDCL LT-I Residential Blended Tariff");
      tariff.setCode("MSEDCL_LT1_RES");
      tariff.setVersionNumber(1);
      tariff.setEffectiveFrom("2024-01-01");
      tariff.setEffectiveTo("2028-12-31");
      tariff.setActive(true);
      tariff.setParametersJson(objectMapper.writeValueAsString(Map.of(
          "tariffPerUnitInr", 9.2,
          "selfConsumptionRatio", 1.0
      )));
      tariff.setNotes("Standard blended MSEDCL domestic slab rate used for deterministic annual savings.");
      tariff.setCreatedByUid("system-bootstrap");
      ruleRepository.save(tariff);

      log.info("Seeded 4 default Vidarbha solar & subsidy configuration rules into MySQL.");
    };
  }
}
