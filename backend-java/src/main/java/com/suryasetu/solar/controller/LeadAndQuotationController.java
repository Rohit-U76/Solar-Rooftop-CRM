package com.suryasetu.solar.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.suryasetu.solar.dto.ApiDtos.AdminRuleDto;
import com.suryasetu.solar.dto.ApiDtos.CreateLeadRequest;
import com.suryasetu.solar.dto.ApiDtos.LeadEvaluationRequest;
import com.suryasetu.solar.dto.ApiDtos.LeadScoringOutputDto;
import com.suryasetu.solar.dto.ApiDtos.LeadValidationRequest;
import com.suryasetu.solar.dto.ApiDtos.QuotationCalculateRequest;
import com.suryasetu.solar.dto.ApiDtos.QuotationCalculateResponse;
import com.suryasetu.solar.dto.ApiDtos.ValidationResultDto;
import com.suryasetu.solar.entity.AdminConfigRuleEntity;
import com.suryasetu.solar.entity.SolarLeadEntity;
import com.suryasetu.solar.entity.SolarQuotationEntity;
import com.suryasetu.solar.repository.AdminConfigRuleRepository;
import com.suryasetu.solar.repository.SolarLeadRepository;
import com.suryasetu.solar.repository.SolarQuotationRepository;
import com.suryasetu.solar.security.AccessControlService;
import com.suryasetu.solar.security.AccessControlService.AccessDecision;
import com.suryasetu.solar.security.AuthenticatedPrincipal;
import com.suryasetu.solar.service.GeminiVisionService;
import com.suryasetu.solar.service.SolarCalculationService;
import com.suryasetu.solar.service.SolarCalculationService.PincodeServiceInfo;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class LeadAndQuotationController {

  private final SolarCalculationService solarCalculationService;
  private final GeminiVisionService geminiVisionService;
  private final AccessControlService accessControlService;
  private final SolarLeadRepository leadRepository;
  private final SolarQuotationRepository quotationRepository;
  private final AdminConfigRuleRepository adminRuleRepository;
  private final ObjectMapper objectMapper;

  public LeadAndQuotationController(
      SolarCalculationService solarCalculationService,
      GeminiVisionService geminiVisionService,
      AccessControlService accessControlService,
      SolarLeadRepository leadRepository,
      SolarQuotationRepository quotationRepository,
      AdminConfigRuleRepository adminRuleRepository,
      ObjectMapper objectMapper
  ) {
    this.solarCalculationService = solarCalculationService;
    this.geminiVisionService = geminiVisionService;
    this.accessControlService = accessControlService;
    this.leadRepository = leadRepository;
    this.quotationRepository = quotationRepository;
    this.adminRuleRepository = adminRuleRepository;
    this.objectMapper = objectMapper;
  }

  @PostMapping("/leads/validate")
  public ResponseEntity<ValidationResultDto> validateLead(
      @RequestBody LeadValidationRequest request
  ) {
    ValidationResultDto result = solarCalculationService.validateLeadSubmission(request);
    if (!result.valid()) {
      return ResponseEntity.badRequest().body(result);
    }
    return ResponseEntity.ok(result);
  }

  @PostMapping("/leads/evaluate")
  public ResponseEntity<?> evaluateLead(@RequestBody LeadEvaluationRequest request) {
    try {
      LeadScoringOutputDto deterministic = solarCalculationService.evaluateLeadQualification(request);
      if (Boolean.TRUE.equals(request.includeAiExplanation())) {
        String narrative =
            geminiVisionService.generateTransparentAiExplanation(request, deterministic);
        deterministic = new LeadScoringOutputDto(
            deterministic.totalScore(),
            deterministic.category(),
            deterministic.recommendedCapacityKw(),
            deterministic.recommendationLabel(),
            deterministic.ownershipPoints(),
            deterministic.billPoints(),
            deterministic.roofAreaPoints(),
            deterministic.loadPoints(),
            deterministic.pincodePoints(),
            deterministic.consumptionPoints(),
            narrative,
            deterministic.nextRecommendedAction(),
            deterministic.suggestedSurveyStatus()
        );
      }
      return ResponseEntity.ok(Map.of("evaluation", deterministic));
    } catch (Exception e) {
      return ResponseEntity.badRequest().body(Map.of(
          "error", e.getMessage() != null ? e.getMessage() : "Lead evaluation failed."
      ));
    }
  }

  @GetMapping("/leads")
  public ResponseEntity<?> listLeads(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestHeader(value = "X-Workspace-Role", required = false) String workspaceRole
  ) {
    AccessDecision staffCheck =
        accessControlService.verifyResourceAccess(principal, workspaceRole, null, null, true);
    List<SolarLeadEntity> leads = staffCheck.allowed()
        ? leadRepository.findAllByOrderByCreatedAtDesc()
        : leadRepository.findByOwnerUidOrderByCreatedAtDesc(principal.uid());
    return ResponseEntity.ok(Map.of("leads", leads));
  }

  @PostMapping("/leads")
  public ResponseEntity<?> createLead(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestBody CreateLeadRequest req
  ) {
    LeadValidationRequest valReq = new LeadValidationRequest(
        req.customerName(),
        req.mobileNumber(),
        req.email(),
        req.ownershipType(),
        req.roofType(),
        req.rooftopAreaSqFt(),
        req.avgMonthlyBillInr(),
        req.pincode(),
        req.dpdpConsent(),
        null,
        null
    );
    ValidationResultDto validation = solarCalculationService.validateLeadSubmission(valReq);
    if (!validation.valid()) {
      return ResponseEntity.badRequest().body(validation);
    }

    LeadScoringOutputDto score = solarCalculationService.evaluateLeadQualification(
        new LeadEvaluationRequest(
            req.ownershipType(),
            req.avgMonthlyBillInr(),
            req.rooftopAreaSqFt(),
            req.sanctionedLoadKw(),
            req.pincode(),
            req.averageUnitsKwh(),
            req.roofType(),
            1400.0,
            false
        )
    );
    PincodeServiceInfo pinInfo = solarCalculationService.resolvePincodeService(req.pincode());

    SolarLeadEntity entity = new SolarLeadEntity();
    entity.setId("lead_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
    entity.setLeadNumber("SS-NGP-" + (1000 + leadRepository.count() + 1));
    entity.setOwnerUid(principal.uid());
    entity.setCustomerName(req.customerName().trim());
    entity.setMobileNumber(req.mobileNumber().trim());
    entity.setEmail(req.email() != null ? req.email().trim() : "");
    entity.setDpdpConsent(req.dpdpConsent());
    entity.setOwnershipType(req.ownershipType());
    entity.setRoofType(req.roofType());
    entity.setRooftopAreaSqFt(req.rooftopAreaSqFt());
    entity.setAvgMonthlyBillInr(req.avgMonthlyBillInr());
    entity.setAverageUnitsKwh(req.averageUnitsKwh());
    entity.setSanctionedLoadKw(req.sanctionedLoadKw());
    entity.setPincode(req.pincode().trim());
    entity.setCity(pinInfo.city());
    entity.setQualificationCategory(score.category());
    entity.setLeadScore(score.totalScore());
    entity.setRecommendedCapacityKw(score.recommendedCapacityKw());
    entity.setRecommendationLabel(score.recommendationLabel());
    entity.setRecommendationReason(score.recommendationReason());
    entity.setNextRecommendedAction(score.nextRecommendedAction());
    entity.setSurveyStatus(score.suggestedSurveyStatus());
    entity.setLeadStage("QUALIFIED");

    return ResponseEntity.status(HttpStatus.CREATED).body(leadRepository.save(entity));
  }

  @PostMapping("/quotations/calculate")
  public ResponseEntity<?> calculateQuotation(@RequestBody QuotationCalculateRequest request) {
    try {
      QuotationCalculateRequest effectiveRequest = request;
      if (request.rules() == null || request.rules().isEmpty()) {
        List<AdminRuleDto> dbRules = loadRulesFromMysql();
        effectiveRequest = new QuotationCalculateRequest(
            request.quotationDate(),
            request.systemCapacityKw(),
            request.recommendedCapacityKw(),
            request.ownershipType(),
            request.isResidentialTariff(),
            request.selectedPanelCode(),
            request.selectedTariffCode(),
            request.customInstallationAdjustmentInr(),
            request.customEquipmentAdjustmentInr(),
            dbRules
        );
      }

      QuotationCalculateResponse response =
          solarCalculationService.calculateQuotationBundle(effectiveRequest);
      return ResponseEntity.ok(response);
    } catch (Exception e) {
      return ResponseEntity.badRequest().body(Map.of(
          "error", e.getMessage() != null ? e.getMessage() : "Quotation calculation failed."
      ));
    }
  }

  @GetMapping("/quotations")
  public ResponseEntity<?> listQuotations(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestHeader(value = "X-Workspace-Role", required = false) String workspaceRole
  ) {
    AccessDecision staffCheck =
        accessControlService.verifyResourceAccess(principal, workspaceRole, null, null, true);
    List<SolarQuotationEntity> list = staffCheck.allowed()
        ? quotationRepository.findAllByOrderByCreatedAtDesc()
        : quotationRepository.findByOwnerUidOrderByCreatedAtDesc(principal.uid());
    return ResponseEntity.ok(Map.of("quotations", list));
  }

  @GetMapping("/admin/rules")
  public ResponseEntity<?> listAdminRules() {
    return ResponseEntity.ok(Map.of("rules", loadRulesFromMysql()));
  }

  @PostMapping("/admin/rules")
  public ResponseEntity<?> createAdminRuleVersion(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestBody AdminRuleDto dto
  ) {
    AccessDecision adminDecision = accessControlService.checkAdminAccess(principal);
    if (!adminDecision.allowed()) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
          "error", adminDecision.reason()
      ));
    }
    try {
      String cleanCode = dto.code().trim().toUpperCase().replaceAll("[^A-Z0-9_]", "_");
      int nextVersion = adminRuleRepository.findAllByOrderByCodeAscVersionNumberDesc().stream()
          .filter(r -> cleanCode.equals(r.getCode()))
          .mapToInt(AdminConfigRuleEntity::getVersionNumber)
          .max()
          .orElse(0) + 1;

      AdminConfigRuleEntity entity = new AdminConfigRuleEntity();
      entity.setId("rule_" + cleanCode.toLowerCase() + "_v" + nextVersion + "_" + System.currentTimeMillis());
      entity.setRuleCategory(dto.ruleCategory());
      entity.setWorkspaceScope("global");
      entity.setTitle(dto.title());
      entity.setCode(cleanCode);
      entity.setVersionNumber(nextVersion);
      entity.setEffectiveFrom(dto.effectiveFrom());
      entity.setEffectiveTo(dto.effectiveTo());
      entity.setActive(true);
      entity.setParametersJson(objectMapper.writeValueAsString(dto.parameters()));
      entity.setNotes(dto.notes() != null ? dto.notes() : "");
      entity.setCreatedByUid(principal.uid());

      adminRuleRepository.save(entity);
      return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
          "id", entity.getId(),
          "code", entity.getCode(),
          "versionNumber", entity.getVersionNumber()
      ));
    } catch (Exception e) {
      return ResponseEntity.badRequest().body(Map.of("error", "Unable to save rule version."));
    }
  }

  private List<AdminRuleDto> loadRulesFromMysql() {
    return adminRuleRepository.findAllByOrderByCodeAscVersionNumberDesc().stream()
        .map(r -> {
          Map<String, Object> params;
          try {
            params = objectMapper.readValue(
                r.getParametersJson(), new TypeReference<Map<String, Object>>() {}
            );
          } catch (Exception e) {
            params = Map.of();
          }
          return new AdminRuleDto(
              r.getId(),
              r.getRuleCategory(),
              r.getWorkspaceScope(),
              r.getTitle(),
              r.getCode(),
              r.getVersionNumber(),
              r.getEffectiveFrom(),
              r.getEffectiveTo(),
              r.isActive(),
              params,
              r.getNotes(),
              r.getCreatedByUid()
          );
        })
        .toList();
  }
}
