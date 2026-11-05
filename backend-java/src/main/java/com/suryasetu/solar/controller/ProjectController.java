package com.suryasetu.solar.controller;

import com.suryasetu.solar.dto.ApiDtos.ProjectDocumentUploadRequest;
import com.suryasetu.solar.dto.ApiDtos.ProjectDocumentUploadResponse;
import com.suryasetu.solar.dto.ApiDtos.RecordPaymentRequest;
import com.suryasetu.solar.dto.ApiDtos.UpdateStageRequest;
import com.suryasetu.solar.entity.ProjectDocumentEntity;
import com.suryasetu.solar.entity.ProjectPaymentEntity;
import com.suryasetu.solar.entity.SolarProjectEntity;
import com.suryasetu.solar.repository.ProjectPaymentRepository;
import com.suryasetu.solar.repository.SolarProjectRepository;
import com.suryasetu.solar.security.AccessControlService;
import com.suryasetu.solar.security.AccessControlService.AccessDecision;
import com.suryasetu.solar.security.AuthenticatedPrincipal;
import com.suryasetu.solar.service.FileStorageService;
import com.suryasetu.solar.service.GeminiVisionService;
import com.suryasetu.solar.service.SolarCalculationService;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ProjectController {

  private static final Set<String> ALLOWED_DOC_MIMES =
      Set.of("application/pdf", "image/jpeg", "image/png", "image/webp");

  private static final List<String> STAGE_ORDER = List.of(
      "QUOTATION_APPROVED",
      "ADVANCE_PAYMENT_RECEIVED",
      "SITE_SURVEY_COMPLETED",
      "INSTALLATION_SCHEDULED",
      "INSTALLATION_IN_PROGRESS",
      "INSTALLATION_COMPLETED",
      "NET_METERING_DISCOM",
      "SUBSIDY_SUBMITTED",
      "SUBSIDY_CREDITED",
      "PROJECT_COMPLETED"
  );

  private final FileStorageService fileStorageService;
  private final GeminiVisionService geminiVisionService;
  private final AccessControlService accessControlService;
  private final SolarProjectRepository projectRepository;
  private final ProjectPaymentRepository paymentRepository;

  public ProjectController(
      FileStorageService fileStorageService,
      GeminiVisionService geminiVisionService,
      AccessControlService accessControlService,
      SolarProjectRepository projectRepository,
      ProjectPaymentRepository paymentRepository
  ) {
    this.fileStorageService = fileStorageService;
    this.geminiVisionService = geminiVisionService;
    this.accessControlService = accessControlService;
    this.projectRepository = projectRepository;
    this.paymentRepository = paymentRepository;
  }

  @PostMapping("/projects/{projectId}/documents/{docId}/file")
  public ResponseEntity<?> uploadProjectDocument(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestHeader(value = "X-Workspace-Role", required = false) String workspaceRole,
      @PathVariable String projectId,
      @PathVariable String docId,
      @RequestBody ProjectDocumentUploadRequest req
  ) {
    try {
      if (!isValidIdentifier(projectId) || !isValidIdentifier(docId)) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Invalid project or document identifier."
        ));
      }

      List<String> staffList = req.assignedStaffUids() != null
          ? req.assignedStaffUids().stream().limit(10).toList()
          : List.of();
      AccessDecision access = accessControlService.verifyResourceAccess(
          principal, workspaceRole, null, staffList, true
      );
      if (!access.allowed()) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
            "error",
            access.reason() != null
                ? access.reason()
                : "Staff authorization required to upload project documents."
        ));
      }

      if (req.fileName() == null
          || req.mimeType() == null
          || req.base64Data() == null
          || req.ownerUid() == null) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "File name, MIME type, owner UID, and file payload are required."
        ));
      }

      if (!ALLOWED_DOC_MIMES.contains(req.mimeType())) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Unsupported document type. Upload PDF, JPEG, PNG, or WebP."
        ));
      }

      byte[] bytes = fileStorageService.decodeBase64Payload(req.base64Data());
      if (bytes.length == 0 || bytes.length > SolarCalculationService.MAX_BILL_FILE_BYTES) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Project document file must be between 1 KB and 5 MB."
        ));
      }

      if (!geminiVisionService.validateDocumentMagicBytes(bytes, req.mimeType())) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Invalid or corrupted document binary. Upload an authentic PDF, JPEG, PNG, or WebP."
        ));
      }

      String uploaderName = (req.uploadedByName() != null && !req.uploadedByName().isBlank())
          ? req.uploadedByName()
          : (principal.email() != null && !principal.email().isBlank() ? principal.email() : "EPC Engineer");

      ProjectDocumentEntity saved = fileStorageService.storeProjectDocument(
          projectId,
          docId,
          req.ownerUid(),
          staffList,
          principal.uid(),
          uploaderName,
          req.docType(),
          req.fileName(),
          req.mimeType(),
          req.notes(),
          bytes
      );

      long sizeKb = Math.max(1L, Math.round(saved.getFileSizeBytes() / 1024.0));
      return ResponseEntity.ok(new ProjectDocumentUploadResponse(
          true,
          sizeKb,
          saved.getFileName(),
          saved.getCreatedAt().toString()
      ));
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
          "error", "Unable to store project document securely."
      ));
    }
  }

  @GetMapping("/projects/{projectId}/documents/{docId}/file")
  public ResponseEntity<?> downloadProjectDocument(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestHeader(value = "X-Workspace-Role", required = false) String workspaceRole,
      @PathVariable String projectId,
      @PathVariable String docId
  ) {
    try {
      if (!isValidIdentifier(projectId) || !isValidIdentifier(docId)) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Invalid project or document identifier."
        ));
      }

      Optional<ProjectDocumentEntity> metaOpt =
          fileStorageService.findProjectDocumentMeta(projectId, docId);
      if (metaOpt.isEmpty()) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
            "error", "Uploaded binary file not found for this document record."
        ));
      }

      ProjectDocumentEntity meta = metaOpt.get();
      List<String> staffList = meta.getAssignedStaffUidsCsv() != null && !meta.getAssignedStaffUidsCsv().isBlank()
          ? Arrays.asList(meta.getAssignedStaffUidsCsv().split(","))
          : List.of();

      AccessDecision access = accessControlService.verifyResourceAccess(
          principal, workspaceRole, meta.getOwnerUid(), staffList, false
      );
      if (!access.allowed()) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
            "error",
            access.reason() != null
                ? access.reason()
                : "Access denied to protected project document."
        ));
      }

      byte[] bytes = fileStorageService.readProjectDocumentBytes(projectId, docId);
      String cleanName = meta.getFileName().replace("\"", "");

      return ResponseEntity.ok()
          .contentType(MediaType.parseMediaType(meta.getMimeType()))
          .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + cleanName + "\"")
          .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
          .body(bytes);
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
          "error", "Unable to download protected project document."
      ));
    }
  }

  @GetMapping("/projects")
  public ResponseEntity<?> listProjects(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestHeader(value = "X-Workspace-Role", required = false) String workspaceRole
  ) {
    AccessDecision staffCheck =
        accessControlService.verifyResourceAccess(principal, workspaceRole, null, null, true);
    List<SolarProjectEntity> list = staffCheck.allowed()
        ? projectRepository.findAllByOrderByCreatedAtDesc()
        : projectRepository.findByOwnerUidOrderByCreatedAtDesc(principal.uid());
    return ResponseEntity.ok(Map.of("projects", list));
  }

  @PatchMapping("/projects/{projectId}/stage")
  public ResponseEntity<?> updateProjectStage(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestHeader(value = "X-Workspace-Role", required = false) String workspaceRole,
      @PathVariable String projectId,
      @RequestBody UpdateStageRequest req
  ) {
    AccessDecision staffCheck =
        accessControlService.verifyResourceAccess(principal, workspaceRole, null, null, true);
    if (!staffCheck.allowed()) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", staffCheck.reason()));
    }

    Optional<SolarProjectEntity> projOpt = projectRepository.findById(projectId);
    if (projOpt.isEmpty()) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Project not found."));
    }

    int targetIdx = STAGE_ORDER.indexOf(req.targetStage()) + 1;
    if (targetIdx <= 0) {
      return ResponseEntity.badRequest().body(Map.of("error", "Invalid project lifecycle stage."));
    }

    SolarProjectEntity proj = projOpt.get();
    proj.setCurrentStage(req.targetStage());
    proj.setStageIndex(targetIdx);
    proj.setPendingActivities(req.pendingActivities());
    proj.setDelayed(req.delayed());
    proj.setDelayReason(req.delayed() ? req.delayReason() : "");
    proj.setStageStartedAt(Instant.now().toString());
    proj.setUpdatedByName(req.updatedByName() != null ? req.updatedByName() : principal.email());

    return ResponseEntity.ok(projectRepository.save(proj));
  }

  @PostMapping("/projects/{projectId}/payments")
  public ResponseEntity<?> recordSimulatedPayment(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestHeader(value = "X-Workspace-Role", required = false) String workspaceRole,
      @PathVariable String projectId,
      @RequestBody RecordPaymentRequest req
  ) {
    AccessDecision staffCheck =
        accessControlService.verifyResourceAccess(principal, workspaceRole, null, null, true);
    if (!staffCheck.allowed()) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", staffCheck.reason()));
    }

    SolarProjectEntity project = projectRepository.findById(projectId).orElse(null);
    if (project == null) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Project not found."));
    }

    ProjectPaymentEntity payment = new ProjectPaymentEntity();
    payment.setId("pay_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
    payment.setProjectId(projectId);
    payment.setOwnerUid(project.getOwnerUid());
    payment.setPaymentReference("SIM-" + System.currentTimeMillis());
    payment.setMilestone(req.milestone());
    payment.setAmountInr(req.amountInr());
    payment.setPaymentMode(req.paymentMode());
    payment.setSimulation(true);
    payment.setRecordedByUid(principal.uid());

    return ResponseEntity.status(HttpStatus.CREATED).body(paymentRepository.save(payment));
  }

  @GetMapping("/public/track/{trackingToken}")
  public ResponseEntity<?> getPublicProjectStatus(@PathVariable String trackingToken) {
    return projectRepository.findByTrackingToken(trackingToken)
        .<ResponseEntity<?>>map(p -> ResponseEntity.ok(Map.of(
            "trackingToken", p.getTrackingToken(),
            "projectNumber", p.getProjectNumber(),
            "city", p.getCity(),
            "systemCapacityKw", p.getSystemCapacityKw(),
            "currentStage", p.getCurrentStage(),
            "stageIndex", p.getStageIndex(),
            "pendingActivities", p.getPendingActivities() != null ? p.getPendingActivities() : "",
            "isDelayed", p.isDelayed(),
            "delaySummary", p.getDelayReason() != null ? p.getDelayReason() : ""
        )))
        .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(Map.of("error", "Tracking token not found.")));
  }

  private boolean isValidIdentifier(String value) {
    return value != null && value.matches("^[a-zA-Z0-9_-]{4,120}$");
  }
}
