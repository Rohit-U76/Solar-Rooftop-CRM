package com.suryasetu.solar.service;

import com.suryasetu.solar.dto.ApiDtos.AdminRuleDto;
import com.suryasetu.solar.dto.ApiDtos.BillExtractionPayload;
import com.suryasetu.solar.dto.ApiDtos.LeadEvaluationRequest;
import com.suryasetu.solar.dto.ApiDtos.LeadScoringOutputDto;
import com.suryasetu.solar.dto.ApiDtos.LeadValidationRequest;
import com.suryasetu.solar.dto.ApiDtos.QuotationCalculateRequest;
import com.suryasetu.solar.dto.ApiDtos.QuotationCalculateResponse;
import com.suryasetu.solar.dto.ApiDtos.QuotationCalculationResultDto;
import com.suryasetu.solar.dto.ApiDtos.QuotationComparisonOptionDto;
import com.suryasetu.solar.dto.ApiDtos.ValidationResultDto;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Deterministic Solar Engineering, Lead Qualification, and Subsidy Financial Calculation Engine.
 * Strictly deterministic: AI is NEVER used for generation, pricing, subsidy, or payback calculations.
 */
@Service
public class SolarCalculationService {

  public static final long MAX_BILL_FILE_BYTES = 5L * 1024L * 1024L;
  private static final Set<String> ALLOWED_IMAGE_MIMES =
      Set.of("image/jpeg", "image/png", "image/webp");
  private static final Pattern MOBILE_PATTERN = Pattern.compile("^[6-9][0-9]{9}$");
  private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
  private static final Pattern PINCODE_PATTERN = Pattern.compile("^[0-9]{6}$");

  private static final Map<String, String[]> VIDARBHA_PINCODE_MAP = Map.of(
      "440", new String[]{"Nagpur", "Nagpur"},
      "441", new String[]{"Kamptee / Hingna", "Nagpur Rural & Bhandara"},
      "442", new String[]{"Wardha / Chandrapur", "Wardha & Chandrapur"},
      "443", new String[]{"Khamgaon / Buldhana", "Buldhana"},
      "444", new String[]{"Amravati / Akola", "Amravati & Akola"},
      "445", new String[]{"Yavatmal / Washim", "Yavatmal"}
  );

  public record PincodeServiceInfo(
      String pincode,
      String city,
      String district,
      boolean primaryVidarbhaZone,
      boolean secondaryMaharashtraZone,
      boolean serviceable
  ) {}

  public record SubsidyRuleParams(
      double firstTierMaxKw,
      double firstTierRateInr,
      double secondTierMaxKw,
      double secondTierRateInr,
      double maxSubsidyCapInr,
      boolean residentialOnly
  ) {}

  public record ClarityClassification(String clarityStatus, int confidenceScore, boolean requiresReupload) {}

  public PincodeServiceInfo resolvePincodeService(String rawPincode) {
    String clean = rawPincode == null ? "" : rawPincode.trim();
    String prefix3 = clean.length() >= 3 ? clean.substring(0, 3) : "";
    String prefix1 = clean.length() >= 1 ? clean.substring(0, 1) : "";

    if (VIDARBHA_PINCODE_MAP.containsKey(prefix3)) {
      String[] info = VIDARBHA_PINCODE_MAP.get(prefix3);
      return new PincodeServiceInfo(clean, info[0], info[1], true, false, true);
    }
    if ("4".equals(prefix1) && clean.length() == 6) {
      return new PincodeServiceInfo(
          clean, "Maharashtra (Extended)", "Maharashtra", false, true, true
      );
    }
    return new PincodeServiceInfo(
        clean, "Outside Service Zone", "Non-Vidarbha", false, false, false
    );
  }

  public ValidationResultDto validateLeadSubmission(LeadValidationRequest input) {
    Map<String, String> errors = new LinkedHashMap<>();

    String name = input.customerName() == null ? "" : input.customerName().trim();
    if (name.length() < 2 || name.length() > 100) {
      errors.put("customerName", "Customer name must be between 2 and 100 characters.");
    }

    String mobile = input.mobileNumber() == null ? "" : input.mobileNumber().trim();
    if (!MOBILE_PATTERN.matcher(mobile).matches()) {
      errors.put("mobileNumber", "Enter a valid 10-digit Indian mobile number starting with 6–9.");
    }

    String email = input.email() == null ? "" : input.email().trim();
    if (!email.isEmpty() && (!EMAIL_PATTERN.matcher(email).matches() || email.length() > 160)) {
      errors.put("email", "Enter a valid email address or leave optional field blank.");
    }

    if (input.ownershipType() == null
        || !Set.of("OWNER", "TENANT").contains(input.ownershipType())) {
      errors.put("ownershipType", "Select whether you are a property owner or tenant.");
    }

    if (input.roofType() == null
        || !Set.of("RCC", "METAL_SHEET", "TILED", "OTHER").contains(input.roofType())) {
      errors.put("roofType", "Select a valid rooftop structure type.");
    }

    double area = input.rooftopAreaSqFt() == null ? Double.NaN : input.rooftopAreaSqFt();
    if (!Double.isFinite(area) || area < 50 || area > 100000) {
      errors.put(
          "rooftopAreaSqFt",
          "Available shadow-free rooftop area must be between 50 and 100,000 sq ft."
      );
    }

    double bill = input.avgMonthlyBillInr() == null ? Double.NaN : input.avgMonthlyBillInr();
    if (!Double.isFinite(bill) || bill < 100 || bill > 1000000) {
      errors.put(
          "avgMonthlyBillInr",
          "Average monthly electricity bill must be between ₹100 and ₹10,00,000."
      );
    }

    String pin = input.pincode() == null ? "" : input.pincode().trim();
    if (!PINCODE_PATTERN.matcher(pin).matches()) {
      errors.put("pincode", "Enter a valid 6-digit postal pincode.");
    }

    if (input.dpdpConsent() == null || !input.dpdpConsent()) {
      errors.put(
          "dpdpConsent",
          "Consent to process electricity bill and contact details under DPDP Act 2023 is required."
      );
    }

    if (input.fileMimeType() != null && !ALLOWED_IMAGE_MIMES.contains(input.fileMimeType())) {
      errors.put("billImage", "Unsupported image format. Upload JPEG, PNG, or WebP.");
    }

    if (input.fileSizeBytes() != null
        && (input.fileSizeBytes() <= 0 || input.fileSizeBytes() > MAX_BILL_FILE_BYTES)) {
      errors.put("billImage", "Electricity bill image must be between 1 KB and 5 MB.");
    }

    return new ValidationResultDto(errors.isEmpty(), errors);
  }

  public ValidationResultDto validateExtractionConfirmation(BillExtractionPayload payload) {
    Map<String, String> errors = new LinkedHashMap<>();

    if (payload.consumerNumber() == null || payload.consumerNumber().trim().length() < 4) {
      errors.put("consumerNumber", "Consumer number is required before confirming bill extraction.");
    }
    if (payload.discomName() == null || payload.discomName().trim().length() < 2) {
      errors.put("discomName", "Distribution company (DISCOM) name is required.");
    }
    if (payload.tariffCategory() == null || payload.tariffCategory().trim().length() < 2) {
      errors.put("tariffCategory", "Tariff category (e.g. LT-I Residential) is required.");
    }
    if (!Double.isFinite(payload.sanctionedLoadKw())
        || payload.sanctionedLoadKw() <= 0
        || payload.sanctionedLoadKw() > 500) {
      errors.put("sanctionedLoadKw", "Sanctioned load must be greater than 0 kW.");
    }
    if (!Double.isFinite(payload.monthlyUnitsKwh())
        || payload.monthlyUnitsKwh() <= 0
        || payload.monthlyUnitsKwh() > 200000) {
      errors.put("monthlyUnitsKwh", "Monthly electricity units must be greater than 0 kWh.");
    }
    if (!Double.isFinite(payload.billingAmountInr())
        || payload.billingAmountInr() <= 0
        || payload.billingAmountInr() > 1000000) {
      errors.put("billingAmountInr", "Billing amount must be greater than ₹0.");
    }
    if (payload.billingPeriod() == null || payload.billingPeriod().trim().length() < 3) {
      errors.put("billingPeriod", "Billing period is required.");
    }

    return new ValidationResultDto(errors.isEmpty(), errors);
  }

  public ClarityClassification classifyClarity(
      int rawConfidence,
      double monthlyUnitsKwh,
      double billingAmountInr,
      String reportedClarity
  ) {
    int confidence = Math.max(0, Math.min(100, rawConfidence));
    double units = Math.max(0, monthlyUnitsKwh);
    double amount = Math.max(0, billingAmountInr);

    if ("UNCLEAR_REUPLOAD".equals(reportedClarity)
        || confidence < 35
        || (units == 0 && amount == 0)) {
      return new ClarityClassification("UNCLEAR_REUPLOAD", confidence, true);
    }
    if ("CLEAR".equals(reportedClarity) && confidence >= 75 && units > 0 && amount > 0) {
      return new ClarityClassification("CLEAR", confidence, false);
    }
    return new ClarityClassification("LOW_CONFIDENCE", confidence, false);
  }

  public LeadScoringOutputDto evaluateLeadQualification(LeadEvaluationRequest req) {
    double annualGenPerKw =
        req.annualGenPerKw() != null && req.annualGenPerKw() > 0 ? req.annualGenPerKw() : 1400.0;
    String ownershipType = req.ownershipType() != null ? req.ownershipType() : "OWNER";
    double avgMonthlyBill = req.avgMonthlyBillInr() != null ? req.avgMonthlyBillInr() : 0.0;
    double rooftopArea = req.rooftopAreaSqFt() != null ? req.rooftopAreaSqFt() : 0.0;
    double sanctionedLoad = req.sanctionedLoadKw() != null ? req.sanctionedLoadKw() : 0.0;
    double monthlyUnits = req.monthlyUnitsKwh() != null ? req.monthlyUnitsKwh() : 0.0;
    String pincode = req.pincode() != null ? req.pincode().trim() : "";
    String roofType = req.roofType() != null ? req.roofType() : "RCC";

    PincodeServiceInfo serviceInfo = resolvePincodeService(pincode);
    String roofLabel = switch (roofType) {
      case "METAL_SHEET" -> "GI metal sheet roof";
      case "TILED" -> "sloped tiled roof";
      case "OTHER" -> "custom elevated roof structure";
      default -> "RCC flat terrace";
    };

    int ownershipPoints = "OWNER".equals(ownershipType) ? 20 : 4;

    int billPoints = 3;
    if (avgMonthlyBill >= 3000) billPoints = 28;
    else if (avgMonthlyBill >= 2000) billPoints = 20;
    else if (avgMonthlyBill >= 1200) billPoints = 12;
    else if (avgMonthlyBill >= 800) billPoints = 6;

    long effectiveUnits = monthlyUnits > 0 ? Math.round(monthlyUnits) : Math.round(avgMonthlyBill / 9.2);
    int consumptionPoints = 2;
    if (effectiveUnits >= 300) consumptionPoints = 18;
    else if (effectiveUnits >= 200) consumptionPoints = 13;
    else if (effectiveUnits >= 120) consumptionPoints = 7;

    int areaBasePoints = 2;
    if (rooftopArea >= 350) areaBasePoints = 12;
    else if (rooftopArea >= 220) areaBasePoints = 8;
    else if (rooftopArea >= 110) areaBasePoints = 5;

    int roofBonus = "RCC".equals(roofType) ? 2 : ("METAL_SHEET".equals(roofType) ? 1 : 0);
    int roofAreaPoints = Math.min(14, areaBasePoints + roofBonus);

    double effectiveLoad =
        sanctionedLoad > 0 ? sanctionedLoad : Math.max(1.0, Math.round(effectiveUnits / 100.0));
    int loadPoints = 2;
    if (effectiveLoad >= 3) loadPoints = 10;
    else if (effectiveLoad >= 2) loadPoints = 7;
    else if (effectiveLoad >= 1) loadPoints = 4;

    int pincodePoints = 0;
    if (serviceInfo.primaryVidarbhaZone()) pincodePoints = 10;
    else if (serviceInfo.secondaryMaharashtraZone()) pincodePoints = 4;

    int rawSum =
        ownershipPoints + billPoints + consumptionPoints + roofAreaPoints + loadPoints + pincodePoints;
    NumberFormat inFormat = NumberFormat.getNumberInstance(new Locale("en", "IN"));

    // Tenant business rule: phone qualification call, NEVER automatic rejection
    if ("TENANT".equals(ownershipType)) {
      int cappedTenantScore = Math.min(38, rawSum);
      return new LeadScoringOutputDto(
          cappedTenantScore,
          "LOW",
          0,
          "Not yet recommended",
          ownershipPoints,
          billPoints,
          roofAreaPoints,
          loadPoints,
          pincodePoints,
          consumptionPoints,
          "Tenant enquiry in " + serviceInfo.city() + " (" + roofLabel + ") with ₹"
              + inFormat.format(Math.round(avgMonthlyBill)) + "/mo bill (" + effectiveUnits
              + " kWh). Rooftop solar net-metering and residential subsidy require property owner NOC and MSEDCL consumer title verification before sizing confirmation.",
          "Schedule a 10-minute phone qualification call to verify landlord NOC readiness instead of automatic rejection or immediate physical site survey.",
          "HOLD_TENANT_CONSENT"
      );
    }

    if (!serviceInfo.serviceable()) {
      int outOfZoneScore = Math.min(35, rawSum);
      return new LeadScoringOutputDto(
          outOfZoneScore,
          "LOW",
          0,
          "Outside Vidarbha service area",
          ownershipPoints,
          billPoints,
          roofAreaPoints,
          loadPoints,
          pincodePoints,
          consumptionPoints,
          "Pincode " + pincode + " is outside SuryaSetu's primary Vidarbha & Maharashtra installation network.",
          "Schedule a brief phone qualification call to confirm installation address or refer to regional EPC partner.",
          "CALL_SCHEDULED"
      );
    }

    double rawDemandKw = (effectiveUnits * 12.0) / annualGenPerKw;
    long maxRoofSupportedKw = Math.max(1L, (long) Math.floor(rooftopArea / 100.0));
    long recommendedCapacityKw = Math.max(1L, Math.min(Math.round(rawDemandKw), maxRoofSupportedKw));
    String recommendationLabel = recommendedCapacityKw + " kW";

    String category;
    if (avgMonthlyBill < 1000 || effectiveUnits < 110) {
      category = "LOW";
    } else if (rawSum >= 75) {
      category = "HIGH";
    } else if (rawSum >= 52) {
      category = "MEDIUM";
    } else {
      category = "LOW";
    }

    String nextAction =
        "Schedule a phone qualification call to review tariff eligibility, roof mounting, and payback expectations before dispatching a site survey.";
    String suggestedSurvey = "CALL_SCHEDULED";

    if ("HIGH".equals(category)) {
      nextAction = "Assign Nagpur field engineer for priority rooftop site survey and shadow check for "
          + recommendedCapacityKw + " kW plant on " + roofLabel + ".";
      suggestedSurvey = "SURVEY_SCHEDULED";
    } else if ("MEDIUM".equals(category)) {
      nextAction = "Conduct phone qualification call to confirm sanctioned load (" + effectiveLoad
          + " kW), " + roofLabel + " access, and book rooftop survey.";
    }

    String roofLimitedNote = Math.round(rawDemandKw) > maxRoofSupportedKw
        ? " Capacity constrained to " + maxRoofSupportedKw + " kW by " + Math.round(rooftopArea)
            + " sq ft available area."
        : "";
    String lowBillNote = (avgMonthlyBill < 1000 || effectiveUnits < 110)
        ? " Monthly usage (" + effectiveUnits + " kWh, ₹" + Math.round(avgMonthlyBill)
            + ") is modest, so a compact " + recommendedCapacityKw
            + " kW starter system is recommended with a phone qualification call prior to physical survey."
        : " Consumption of " + effectiveUnits + " kWh/month (₹"
            + inFormat.format(Math.round(avgMonthlyBill)) + ") in " + serviceInfo.city() + " on "
            + roofLabel + " aligns well with a " + recommendedCapacityKw
            + " kW rooftop system generating ~"
            + inFormat.format(Math.round(recommendedCapacityKw * annualGenPerKw)) + " units/year.";

    return new LeadScoringOutputDto(
        Math.min(100, rawSum),
        category,
        recommendedCapacityKw,
        recommendationLabel,
        ownershipPoints,
        billPoints,
        roofAreaPoints,
        loadPoints,
        pincodePoints,
        consumptionPoints,
        "Homeowner in " + serviceInfo.city() + " (" + pincode + ")." + lowBillNote + roofLimitedNote,
        nextAction,
        suggestedSurvey
    );
  }

  public AdminRuleDto selectEffectiveRule(
      List<AdminRuleDto> rules,
      String category,
      String quotationDate,
      String codeFilter
  ) {
    return rules.stream()
        .filter(r -> category.equals(r.ruleCategory()))
        .filter(AdminRuleDto::isActive)
        .filter(r -> codeFilter == null || codeFilter.isBlank() || codeFilter.equals(r.code()))
        .filter(r -> r.effectiveFrom().compareTo(quotationDate) <= 0
            && quotationDate.compareTo(r.effectiveTo()) <= 0)
        .max(Comparator.comparingInt(AdminRuleDto::versionNumber))
        .orElseThrow(() -> new IllegalArgumentException(
            "No active " + category + " rule found covering quotation date " + quotationDate
                + (codeFilter != null && !codeFilter.isBlank() ? " for " + codeFilter : "")
                + ". Please verify rule effective dates in Admin Configuration."
        ));
  }

  public int calculateApplicableSubsidy(
      double capacityKw,
      String ownershipType,
      boolean isResidentialTariff,
      SubsidyRuleParams rule
  ) {
    if (capacityKw <= 0) return 0;
    if (!"OWNER".equals(ownershipType)) return 0;
    if (rule.residentialOnly() && !isResidentialTariff) return 0;

    double tier1Kw = Math.min(capacityKw, rule.firstTierMaxKw());
    double tier1Subsidy = tier1Kw * rule.firstTierRateInr();

    double tier2Kw = Math.max(0.0, Math.min(capacityKw, rule.secondTierMaxKw()) - rule.firstTierMaxKw());
    double tier2Subsidy = tier2Kw * rule.secondTierRateInr();

    double rawSubsidy = tier1Subsidy + tier2Subsidy;
    return (int) Math.round(Math.min(rule.maxSubsidyCapInr(), rawSubsidy));
  }

  public QuotationCalculationResultDto calculateSingleOption(
      double systemCapacityKw,
      String ownershipType,
      boolean isResidentialTariff,
      double panelPricePerKwInr,
      double annualGenPerKw,
      double installationPerKwInr,
      double bosAndNetMeteringFlatInr,
      double customEquipmentAdjustmentInr,
      double electricityTariffInr,
      double selfConsumptionRatio,
      SubsidyRuleParams subsidyRule
  ) {
    if (!Double.isFinite(systemCapacityKw) || systemCapacityKw <= 0) {
      throw new IllegalArgumentException("Solar system capacity must be greater than 0 kW.");
    }
    if (!Double.isFinite(electricityTariffInr) || electricityTariffInr <= 0) {
      throw new IllegalArgumentException("Applicable electricity tariff must be greater than ₹0/unit.");
    }

    double effectiveGen = annualGenPerKw > 0 ? annualGenPerKw : 1400.0;
    int annualGenerationUnits = (int) Math.round(systemCapacityKw * effectiveGen);

    int equipmentCostInr = Math.max(
        0, (int) Math.round(systemCapacityKw * panelPricePerKwInr + customEquipmentAdjustmentInr)
    );
    int installationChargesInr = Math.max(
        0, (int) Math.round(systemCapacityKw * installationPerKwInr + bosAndNetMeteringFlatInr)
    );
    int totalInstallationCostInr = equipmentCostInr + installationChargesInr;

    int applicableSubsidyInr = calculateApplicableSubsidy(
        systemCapacityKw, ownershipType, isResidentialTariff, subsidyRule
    );
    int netCustomerCostInr = Math.max(0, totalInstallationCostInr - applicableSubsidyInr);

    double ratio = (selfConsumptionRatio > 0 && selfConsumptionRatio <= 1.0)
        ? selfConsumptionRatio
        : 1.0;
    int selfConsumptionUnits = (int) Math.round(annualGenerationUnits * ratio);
    int estimatedAnnualSavingsInr = (int) Math.round(selfConsumptionUnits * electricityTariffInr);

    double estimatedPaybackYears = estimatedAnnualSavingsInr > 0
        ? Math.round(((double) netCustomerCostInr / estimatedAnnualSavingsInr) * 10.0) / 10.0
        : 0.0;

    return new QuotationCalculationResultDto(
        systemCapacityKw,
        annualGenerationUnits,
        equipmentCostInr,
        installationChargesInr,
        totalInstallationCostInr,
        applicableSubsidyInr,
        netCustomerCostInr,
        electricityTariffInr,
        selfConsumptionUnits,
        estimatedAnnualSavingsInr,
        estimatedPaybackYears
    );
  }

  public QuotationCalculateResponse calculateQuotationBundle(QuotationCalculateRequest req) {
    if (req.rules() == null || req.rules().isEmpty()) {
      throw new IllegalArgumentException("Configuration rules are required to compute a quotation.");
    }

    String qDate = req.quotationDate();
    AdminRuleDto panelRule = selectEffectiveRule(
        req.rules(), "SOLAR_OPTION", qDate, req.selectedPanelCode()
    );
    AdminRuleDto subsidyRuleDoc = selectEffectiveRule(
        req.rules(), "SUBSIDY_RULE", qDate, null
    );
    AdminRuleDto pricingRule = selectEffectiveRule(
        req.rules(), "PRICING_RULE", qDate, null
    );
    AdminRuleDto tariffRule = selectEffectiveRule(
        req.rules(), "ELECTRICITY_TARIFF", qDate, req.selectedTariffCode()
    );

    double pricingGen = numParam(pricingRule.parameters(), "annualGenPerKw", 0);
    double configuredAnnualGen =
        pricingGen > 0 ? pricingGen : numParam(panelRule.parameters(), "annualGenPerKw", 1400);

    double systemCapacityKw = req.systemCapacityKw() != null ? req.systemCapacityKw() : 3.0;
    String ownershipType = req.ownershipType() != null ? req.ownershipType() : "OWNER";
    boolean isResidentialTariff = req.isResidentialTariff() != null && req.isResidentialTariff();
    double panelPricePerKwInr = numParam(panelRule.parameters(), "pricePerKwInr", 42000);
    double installationPerKwInr = numParam(pricingRule.parameters(), "installationPerKwInr", 11000);
    double bosFlatInr = numParam(pricingRule.parameters(), "bosFlatInr", 12000)
        + (req.customInstallationAdjustmentInr() != null ? req.customInstallationAdjustmentInr() : 0);
    double customEquipAdj =
        req.customEquipmentAdjustmentInr() != null ? req.customEquipmentAdjustmentInr() : 0;
    double tariffPerUnit = numParam(tariffRule.parameters(), "tariffPerUnitInr", 8.5);
    double selfUseRatio = numParam(pricingRule.parameters(), "selfConsumptionRatio", 1.0);

    SubsidyRuleParams subsidyParams = new SubsidyRuleParams(
        numParam(subsidyRuleDoc.parameters(), "firstTierMaxKw", 2),
        numParam(subsidyRuleDoc.parameters(), "firstTierRateInr", 30000),
        numParam(subsidyRuleDoc.parameters(), "secondTierMaxKw", 3),
        numParam(subsidyRuleDoc.parameters(), "secondTierRateInr", 18000),
        numParam(subsidyRuleDoc.parameters(), "maxSubsidyCapInr", 78000),
        boolParam(subsidyRuleDoc.parameters(), "residentialOnly", true)
    );

    QuotationCalculationResultDto calculation = calculateSingleOption(
        systemCapacityKw,
        ownershipType,
        isResidentialTariff,
        panelPricePerKwInr,
        configuredAnnualGen,
        installationPerKwInr,
        bosFlatInr,
        customEquipAdj,
        tariffPerUnit,
        selfUseRatio,
        subsidyParams
    );

    // Build 1 kW, 2 kW, 3 kW, and Suitable Alternative comparison matrix
    double recKw = req.recommendedCapacityKw() != null && req.recommendedCapacityKw() > 0
        ? req.recommendedCapacityKw()
        : 0.0;
    double altKw = 5.0;
    String altSubtitle = "Suitable Alternative";
    if (recKw > 0 && recKw != 1.0 && recKw != 2.0 && recKw != 3.0) {
      altKw = recKw;
      altSubtitle = "Recommended Alternative";
    } else if (systemCapacityKw > 0
        && systemCapacityKw != 1.0
        && systemCapacityKw != 2.0
        && systemCapacityKw != 3.0) {
      altKw = systemCapacityKw;
      altSubtitle = "Selected Alternative";
    }

    double[] kwTiers = new double[]{1.0, 2.0, 3.0, altKw};
    String[] keys = new String[]{"1kw", "2kw", "3kw", "alt_" + Math.round(altKw) + "kw"};
    String[] labels = new String[]{
        "1 kW Starter", "2 kW Compact", "3 kW Standard", Math.round(altKw) + " kW " + altSubtitle
    };

    List<QuotationComparisonOptionDto> comparisonOptions = new ArrayList<>();
    for (int i = 0; i < kwTiers.length; i++) {
      QuotationCalculationResultDto opt = calculateSingleOption(
          kwTiers[i],
          ownershipType,
          isResidentialTariff,
          panelPricePerKwInr,
          configuredAnnualGen,
          installationPerKwInr,
          bosFlatInr,
          customEquipAdj,
          tariffPerUnit,
          selfUseRatio,
          subsidyParams
      );
      comparisonOptions.add(new QuotationComparisonOptionDto(
          opt.systemCapacityKw(),
          opt.annualGenerationUnits(),
          opt.equipmentCostInr(),
          opt.installationChargesInr(),
          opt.totalInstallationCostInr(),
          opt.applicableSubsidyInr(),
          opt.netCustomerCostInr(),
          opt.electricityTariffInr(),
          opt.selfConsumptionUnits(),
          opt.estimatedAnnualSavingsInr(),
          opt.estimatedPaybackYears(),
          keys[i],
          labels[i],
          recKw > 0 && Math.abs(recKw - kwTiers[i]) < 0.01,
          Math.abs(systemCapacityKw - kwTiers[i]) < 0.01
      ));
    }

    Map<String, Object> snapshot = new LinkedHashMap<>();
    snapshot.put("quotationDate", qDate);
    snapshot.put("panelRuleCode", panelRule.code());
    snapshot.put("panelRuleTitle", panelRule.title());
    snapshot.put("panelRuleVersion", panelRule.versionNumber());
    snapshot.put("panelPricePerKwInr", panelPricePerKwInr);
    snapshot.put("annualGenPerKw", configuredAnnualGen);
    snapshot.put("subsidyRuleCode", subsidyRuleDoc.code());
    snapshot.put("subsidyRuleTitle", subsidyRuleDoc.title());
    snapshot.put("subsidyRuleVersion", subsidyRuleDoc.versionNumber());
    snapshot.put("subsidyEffectiveFrom", subsidyRuleDoc.effectiveFrom());
    snapshot.put("subsidyEffectiveTo", subsidyRuleDoc.effectiveTo());
    snapshot.put("subsidyFirstTierMaxKw", subsidyParams.firstTierMaxKw());
    snapshot.put("subsidyFirstTierRateInr", subsidyParams.firstTierRateInr());
    snapshot.put("subsidySecondTierMaxKw", subsidyParams.secondTierMaxKw());
    snapshot.put("subsidySecondTierRateInr", subsidyParams.secondTierRateInr());
    snapshot.put("subsidyMaxCapInr", subsidyParams.maxSubsidyCapInr());
    snapshot.put("subsidyResidentialOnly", subsidyParams.residentialOnly());
    snapshot.put("pricingRuleCode", pricingRule.code());
    snapshot.put("pricingRuleVersion", pricingRule.versionNumber());
    snapshot.put("installationPerKwInr", installationPerKwInr);
    snapshot.put("bosFlatInr", bosFlatInr);
    snapshot.put("tariffRuleCode", tariffRule.code());
    snapshot.put("tariffRuleVersion", tariffRule.versionNumber());
    snapshot.put("tariffPerUnitInr", tariffPerUnit);
    snapshot.put("isResidentialTariff", isResidentialTariff);

    return new QuotationCalculateResponse(
        calculation, comparisonOptions, snapshot, panelRule.title()
    );
  }

  private double numParam(Map<String, Object> params, String key, double fallback) {
    if (params == null || !params.containsKey(key) || params.get(key) == null) {
      return fallback;
    }
    Object v = params.get(key);
    if (v instanceof Number n) {
      return n.doubleValue();
    }
    try {
      return Double.parseDouble(String.valueOf(v));
    } catch (NumberFormatException e) {
      return fallback;
    }
  }

  private boolean boolParam(Map<String, Object> params, String key, boolean fallback) {
    if (params == null || !params.containsKey(key) || params.get(key) == null) {
      return fallback;
    }
    Object v = params.get(key);
    if (v instanceof Boolean b) {
      return b;
    }
    return Boolean.parseBoolean(String.valueOf(v));
  }
}
