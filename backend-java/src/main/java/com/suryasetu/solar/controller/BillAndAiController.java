package com.suryasetu.solar.controller;

import com.suryasetu.solar.dto.ApiDtos.BillExtractionPayload;
import com.suryasetu.solar.dto.ApiDtos.BillUploadRequest;
import com.suryasetu.solar.dto.ApiDtos.BillUploadResponse;
import com.suryasetu.solar.dto.ApiDtos.ExtractBillRequest;
import com.suryasetu.solar.dto.ApiDtos.ValidationResultDto;
import com.suryasetu.solar.entity.ElectricityBillEntity;
import com.suryasetu.solar.security.AccessControlService;
import com.suryasetu.solar.security.AccessControlService.AccessDecision;
import com.suryasetu.solar.security.AuthenticatedPrincipal;
import com.suryasetu.solar.service.FileStorageService;
import com.suryasetu.solar.service.FileStorageService.StoredFilePayload;
import com.suryasetu.solar.service.GeminiVisionService;
import com.suryasetu.solar.service.GeminiVisionService.GeminiServiceUnavailableException;
import com.suryasetu.solar.service.SolarCalculationService;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class BillAndAiController {

  private static final Set<String> ALLOWED_BILL_MIMES =
      Set.of("image/jpeg", "image/png", "image/webp");

  private final FileStorageService fileStorageService;
  private final GeminiVisionService geminiVisionService;
  private final SolarCalculationService solarCalculationService;
  private final AccessControlService accessControlService;

  public BillAndAiController(
      FileStorageService fileStorageService,
      GeminiVisionService geminiVisionService,
      SolarCalculationService solarCalculationService,
      AccessControlService accessControlService
  ) {
    this.fileStorageService = fileStorageService;
    this.geminiVisionService = geminiVisionService;
    this.solarCalculationService = solarCalculationService;
    this.accessControlService = accessControlService;
  }

  @PostMapping("/bills/upload")
  public ResponseEntity<?> uploadElectricityBill(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestBody BillUploadRequest request
  ) {
    try {
      if (request.fileName() == null || request.mimeType() == null || request.base64Data() == null) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "File name, MIME type, and image payload are required."
        ));
      }
      if (!ALLOWED_BILL_MIMES.contains(request.mimeType())) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Unsupported format. Please upload JPEG, PNG, or WebP."
        ));
      }

      byte[] bytes = fileStorageService.decodeBase64Payload(request.base64Data());
      if (bytes.length == 0 || bytes.length > SolarCalculationService.MAX_BILL_FILE_BYTES) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Electricity bill image must be under 5 MB."
        ));
      }
      if (!geminiVisionService.validateImageMagicBytes(bytes, request.mimeType())) {
        return ResponseEntity.badRequest().body(Map.of(
            "error",
            "Invalid or corrupted image file. Please upload an authentic JPEG, PNG, or WebP bill photo."
        ));
      }

      ElectricityBillEntity saved = fileStorageService.storeElectricityBill(
          principal.uid(), request.fileName(), request.mimeType(), bytes
      );

      return ResponseEntity.ok(new BillUploadResponse(
          saved.getStorageRef(),
          saved.getFileSizeBytes(),
          saved.getMimeType(),
          saved.getFileName()
      ));
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
          "error", "Unable to store electricity bill securely."
      ));
    }
  }

  @GetMapping("/bills/file/{storageKey}")
  public ResponseEntity<?> getElectricityBillFile(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestHeader(value = "X-Workspace-Role", required = false) String workspaceRoleHeader,
      @PathVariable String storageKey
  ) {
    try {
      if (storageKey == null || !storageKey.matches("^[a-zA-Z0-9_-]{8,80}$")) {
        return ResponseEntity.badRequest().body(Map.of("error", "Invalid bill identifier."));
      }

      Optional<ElectricityBillEntity> metaOpt = fileStorageService.findBillMetadata(storageKey);
      if (metaOpt.isEmpty()) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
            "error", "Electricity bill file not found."
        ));
      }

      ElectricityBillEntity meta = metaOpt.get();
      AccessDecision decision = accessControlService.verifyResourceAccess(
          principal, workspaceRoleHeader, meta.getOwnerUid(), null, false
      );
      if (!decision.allowed()) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
            "error",
            decision.reason() != null
                ? decision.reason()
                : "Access denied to customer electricity bill."
        ));
      }

      StoredFilePayload payload = fileStorageService.resolveBillBinary("upload:" + storageKey);
      return ResponseEntity.ok()
          .contentType(MediaType.parseMediaType(payload.mimeType()))
          .cacheControl(CacheControl.noCache().cachePrivate())
          .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
          .body(payload.bytes());
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
          "error", "Failed to retrieve electricity bill."
      ));
    }
  }

  @PostMapping("/ai/extract-bill")
  public ResponseEntity<?> extractElectricityBill(@RequestBody ExtractBillRequest request) {
    if (request.storageRef() == null || request.storageRef().isBlank()) {
      return ResponseEntity.badRequest().body(Map.of(
          "error", "Electricity bill storageRef is required."
      ));
    }

    try {
      StoredFilePayload file = fileStorageService.resolveBillBinary(request.storageRef());
      BillExtractionPayload extraction =
          geminiVisionService.analyzeElectricityBillImage(file.bytes(), file.mimeType());
      return ResponseEntity.ok(Map.of("extraction", extraction));
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of(
          "error", e.getMessage(),
          "code", "INVALID_IMAGE_BINARY"
      ));
    } catch (GeminiServiceUnavailableException e) {
      String message = "GEMINI_API_KEY_NOT_CONFIGURED".equals(e.getCode())
          ? "AI Vision key is not configured on the Spring Boot server. Marked bill for manual verification."
          : "AI Vision analysis is temporarily unavailable. Please verify and enter bill details manually.";
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
          "error", message,
          "code", "AI_SERVICE_UNAVAILABLE",
          "fallbackExtraction", geminiVisionService.buildManualFallbackExtraction()
      ));
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
          "error", "AI Vision analysis is temporarily unavailable. Please verify and enter bill details manually.",
          "code", "AI_SERVICE_UNAVAILABLE",
          "fallbackExtraction", geminiVisionService.buildManualFallbackExtraction()
      ));
    }
  }

  @PostMapping("/extractions/validate")
  public ResponseEntity<ValidationResultDto> validateExtraction(
      @RequestBody BillExtractionPayload payload
  ) {
    ValidationResultDto result = solarCalculationService.validateExtractionConfirmation(payload);
    if (!result.valid()) {
      return ResponseEntity.badRequest().body(result);
    }
    return ResponseEntity.ok(result);
  }
}
