package com.suryasetu.solar.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

public final class ApiDtos {

  private ApiDtos() {}

  // Auth DTOs
  public record RegisterRequest(
      String email,
      String password,
      String displayName,
      String role
  ) {}

  public record LoginRequest(String email, String password) {}

  public record AuthResponse(
      String token,
      String uid,
      String email,
      String displayName,
      String role
  ) {}

  // Bill Upload & Document Upload DTOs
  public record BillUploadRequest(String fileName, String mimeType, String base64Data) {}

  public record BillUploadResponse(
      String storageRef,
      long fileSizeBytes,
      String mimeType,
      String fileName
  ) {}

  public record ProjectDocumentUploadRequest(
      String fileName,
      String mimeType,
      String base64Data,
      String ownerUid,
      List<String> assignedStaffUids,
      String uploadedByName,
      String docType,
      String notes
  ) {}

  public record ProjectDocumentUploadResponse(
      boolean stored,
      long fileSizeKb,
      String fileName,
      String createdAt
  ) {}

  // AI Bill Extraction DTOs
  public record ExtractBillRequest(String storageRef) {}

  public record BillExtractionPayload(
      String consumerNumber,
      String discomName,
      String tariffCategory,
      double sanctionedLoadKw,
      double monthlyUnitsKwh,
      double billingAmountInr,
      String billingPeriod,
      int confidenceScore,
      String clarityStatus,
      String extractionNotes,
      Boolean aiFallbackUsed
  ) {}

  // Validation DTOs
  public record LeadValidationRequest(
      String customerName,
      String mobileNumber,
      String email,
      String ownershipType,
      String roofType,
      Double rooftopAreaSqFt,
      Double avgMonthlyBillInr,
      String pincode,
      Boolean dpdpConsent,
      String fileMimeType,
      Long fileSizeBytes
  ) {}

  public record ValidationResultDto(boolean valid, Map<String, String> errors) {}

  // Lead Scoring DTOs
  public record LeadEvaluationRequest(
      String ownershipType,
      Double avgMonthlyBillInr,
      Double rooftopAreaSqFt,
      Double sanctionedLoadKw,
      String pincode,
      Double monthlyUnitsKwh,
      String roofType,
      Double annualGenPerKw,
      Boolean includeAiExplanation
  ) {}

  public record LeadScoringOutputDto(
      int totalScore,
      String category,
      double recommendedCapacityKw,
      String recommendationLabel,
      int ownershipPoints,
      int billPoints,
      int roofAreaPoints,
      int loadPoints,
      int pincodePoints,
      int consumptionPoints,
      String recommendationReason,
      String nextRecommendedAction,
      String suggestedSurveyStatus
  ) {}

  // Quotation & Admin Rule DTOs
  public record AdminRuleDto(
      String id,
      String ruleCategory,
      String workspaceScope,
      String title,
      String code,
      int versionNumber,
      String effectiveFrom,
      String effectiveTo,
      @JsonProperty("isActive") boolean isActive,
      Map<String, Object> parameters,
      String notes,
      String createdByUid
  ) {}

  public record QuotationCalculateRequest(
      String quotationDate,
      Double systemCapacityKw,
      Double recommendedCapacityKw,
      String ownershipType,
      Boolean isResidentialTariff,
      String selectedPanelCode,
      String selectedTariffCode,
      Double customInstallationAdjustmentInr,
      Double customEquipmentAdjustmentInr,
      List<AdminRuleDto> rules
  ) {}

  public record QuotationCalculationResultDto(
      double systemCapacityKw,
      int annualGenerationUnits,
      int equipmentCostInr,
      int installationChargesInr,
      int totalInstallationCostInr,
      int applicableSubsidyInr,
      int netCustomerCostInr,
      double electricityTariffInr,
      int selfConsumptionUnits,
      int estimatedAnnualSavingsInr,
      double estimatedPaybackYears
  ) {}

  public record QuotationComparisonOptionDto(
      double systemCapacityKw,
      int annualGenerationUnits,
      int equipmentCostInr,
      int installationChargesInr,
      int totalInstallationCostInr,
      int applicableSubsidyInr,
      int netCustomerCostInr,
      double electricityTariffInr,
      int selfConsumptionUnits,
      int estimatedAnnualSavingsInr,
      double estimatedPaybackYears,
      String optionKey,
      String optionLabel,
      @JsonProperty("isRecommended") boolean isRecommended,
      @JsonProperty("isSelected") boolean isSelected
  ) {}

  public record QuotationCalculateResponse(
      QuotationCalculationResultDto calculation,
      List<QuotationComparisonOptionDto> comparisonOptions,
      Map<String, Object> appliedRuleSnapshot,
      String panelTitle
  ) {}

  // MySQL Persistence Request DTOs
  public record CreateLeadRequest(
      String customerName,
      String mobileNumber,
      String email,
      boolean dpdpConsent,
      String ownershipType,
      String roofType,
      double rooftopAreaSqFt,
      double avgMonthlyBillInr,
      double averageUnitsKwh,
      double sanctionedLoadKw,
      String pincode
  ) {}

  public record UpdateStageRequest(
      String targetStage,
      String pendingActivities,
      String remarks,
      boolean delayed,
      String delayReason,
      String updatedByName
  ) {}

  public record RecordPaymentRequest(
      String milestone,
      int amountInr,
      String paymentMode
  ) {}
}
