package com.suryasetu.solar.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.suryasetu.solar.dto.ApiDtos.BillExtractionPayload;
import com.suryasetu.solar.dto.ApiDtos.LeadEvaluationRequest;
import com.suryasetu.solar.dto.ApiDtos.LeadScoringOutputDto;
import com.suryasetu.solar.service.SolarCalculationService.ClarityClassification;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class GeminiVisionService {

  private final String apiKey;
  private final String modelName;
  private final SolarCalculationService solarCalculationService;
  private final ObjectMapper objectMapper = new ObjectMapper();
  private final HttpClient httpClient = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(15))
      .build();

  public GeminiVisionService(
      @Value("${suryasetu.gemini.api-key:}") String apiKey,
      @Value("${suryasetu.gemini.model:gemini-3.8-flash}") String modelName,
      SolarCalculationService solarCalculationService
  ) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.solarCalculationService = solarCalculationService;
  }

  public static class GeminiServiceUnavailableException extends RuntimeException {
    private final String code;

    public GeminiServiceUnavailableException(String code, String message) {
      super(message);
      this.code = code;
    }

    public String getCode() {
      return code;
    }
  }

  public boolean validateImageMagicBytes(byte[] buffer, String mimeType) {
    if (buffer == null || buffer.length < 12 || mimeType == null) {
      return false;
    }
    if ("image/jpeg".equals(mimeType)) {
      return (buffer[0] & 0xFF) == 0xFF
          && (buffer[1] & 0xFF) == 0xD8
          && (buffer[2] & 0xFF) == 0xFF;
    }
    if ("image/png".equals(mimeType)) {
      return (buffer[0] & 0xFF) == 0x89
          && (buffer[1] & 0xFF) == 0x50
          && (buffer[2] & 0xFF) == 0x4E
          && (buffer[3] & 0xFF) == 0x47;
    }
    if ("image/webp".equals(mimeType)) {
      String riff = new String(buffer, 0, 4, StandardCharsets.US_ASCII);
      String webp = new String(buffer, 8, 4, StandardCharsets.US_ASCII);
      return "RIFF".equals(riff) && "WEBP".equals(webp);
    }
    return false;
  }

  public boolean validateDocumentMagicBytes(byte[] buffer, String mimeType) {
    if (buffer == null || buffer.length < 8 || mimeType == null) {
      return false;
    }
    if ("application/pdf".equals(mimeType)) {
      String header = new String(buffer, 0, 5, StandardCharsets.US_ASCII);
      return "%PDF-".equals(header);
    }
    return validateImageMagicBytes(buffer, mimeType);
  }

  public BillExtractionPayload analyzeElectricityBillImage(byte[] imageBytes, String mimeType) {
    if (!validateImageMagicBytes(imageBytes, mimeType)) {
      throw new IllegalArgumentException(
          "Uploaded file failed binary image signature verification. Please upload a valid JPEG, PNG, or WebP photo."
      );
    }
    if (apiKey == null || apiKey.isBlank() || "MY_GEMINI_API_KEY".equals(apiKey)) {
      throw new GeminiServiceUnavailableException(
          "GEMINI_API_KEY_NOT_CONFIGURED",
          "GEMINI_API_KEY is not configured. Marked bill for manual verification."
      );
    }

    try {
      String base64Image = Base64.getEncoder().encodeToString(imageBytes);

      Map<String, Object> schemaProperties = new LinkedHashMap<>();
      schemaProperties.put("consumerNumber", Map.of("type", "STRING"));
      schemaProperties.put("discomName", Map.of("type", "STRING"));
      schemaProperties.put("tariffCategory", Map.of("type", "STRING"));
      schemaProperties.put("sanctionedLoadKw", Map.of("type", "NUMBER"));
      schemaProperties.put("monthlyUnitsKwh", Map.of("type", "NUMBER"));
      schemaProperties.put("billingAmountInr", Map.of("type", "NUMBER"));
      schemaProperties.put("billingPeriod", Map.of("type", "STRING"));
      schemaProperties.put("confidenceScore", Map.of("type", "NUMBER"));
      schemaProperties.put("clarityStatus", Map.of("type", "STRING"));
      schemaProperties.put("extractionNotes", Map.of("type", "STRING"));

      Map<String, Object> responseSchema = Map.of(
          "type", "OBJECT",
          "properties", schemaProperties,
          "required", List.of(
              "consumerNumber", "discomName", "tariffCategory", "sanctionedLoadKw",
              "monthlyUnitsKwh", "billingAmountInr", "billingPeriod",
              "confidenceScore", "clarityStatus", "extractionNotes"
          )
      );

      String prompt =
          "Analyse this Indian electricity utility bill image for rooftop solar qualification in Maharashtra/Vidarbha. "
              + "Extract ONLY values visibly printed on the bill. "
              + "1. NEVER invent, guess, or hallucinate missing electricity bill values. "
              + "2. If a string field is missing or illegible, return \"\". "
              + "3. If a numeric field is missing or illegible, return 0. "
              + "4. If blurry or unreadable, set clarityStatus to UNCLEAR_REUPLOAD and confidenceScore below 35. "
              + "5. If partially uncertain, set clarityStatus to LOW_CONFIDENCE (35-74). "
              + "6. Only set clarityStatus to CLEAR (75-100) when key bill fields are clearly legible.";

      Map<String, Object> requestPayload = Map.of(
          "systemInstruction", Map.of(
              "parts", List.of(Map.of(
                  "text",
                  "You are a precision utility document extraction engine for SuryaSetu Solar in Nagpur, India. Output strictly valid JSON matching the schema."
              ))
          ),
          "contents", List.of(Map.of(
              "parts", List.of(
                  Map.of("inlineData", Map.of("mimeType", mimeType, "data", base64Image)),
                  Map.of("text", prompt)
              )
          )),
          "generationConfig", Map.of(
              "responseMimeType", "application/json",
              "responseSchema", responseSchema
          )
      );

      String endpoint = "https://generativelanguage.googleapis.com/v1beta/models/"
          + modelName + ":generateContent?key=" + apiKey;

      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(endpoint))
          .timeout(Duration.ofSeconds(30))
          .header("Content-Type", "application/json")
          .header("User-Agent", "aistudio-build")
          .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestPayload)))
          .build();

      HttpResponse<String> response =
          httpClient.send(request, HttpResponse.BodyHandlers.ofString());

      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        throw new GeminiServiceUnavailableException(
            "AI_SERVICE_UNAVAILABLE",
            "Gemini Vision API returned HTTP " + response.statusCode()
        );
      }

      JsonNode root = objectMapper.readTree(response.body());
      String rawJsonText = root.path("candidates")
          .path(0)
          .path("content")
          .path("parts")
          .path(0)
          .path("text")
          .asText("{}");

      JsonNode parsed = objectMapper.readTree(rawJsonText);
      double units = Math.max(0.0, parsed.path("monthlyUnitsKwh").asDouble(0.0));
      double amount = Math.max(0.0, parsed.path("billingAmountInr").asDouble(0.0));
      int rawConfidence = (int) Math.round(parsed.path("confidenceScore").asDouble(0.0));
      String reportedClarity = parsed.path("clarityStatus").asText("");

      ClarityClassification classified =
          solarCalculationService.classifyClarity(rawConfidence, units, amount, reportedClarity);

      String notes = parsed.path("extractionNotes").asText("");
      if (notes.isBlank()) {
        notes = switch (classified.clarityStatus()) {
          case "UNCLEAR_REUPLOAD" ->
              "Bill image is blurry or unreadable. Please upload a clearer photo.";
          case "LOW_CONFIDENCE" ->
              "Low extraction confidence on one or more fields; manual verification required.";
          default -> "All primary utility fields extracted clearly. Please review and confirm.";
        };
      }

      return new BillExtractionPayload(
          truncate(parsed.path("consumerNumber").asText(""), 60),
          truncate(parsed.path("discomName").asText(""), 120),
          truncate(parsed.path("tariffCategory").asText(""), 80),
          Math.max(0.0, Math.min(500.0, parsed.path("sanctionedLoadKw").asDouble(0.0))),
          Math.min(200000.0, units),
          Math.min(1000000.0, amount),
          truncate(parsed.path("billingPeriod").asText(""), 80),
          classified.confidenceScore(),
          classified.clarityStatus(),
          truncate(notes, 600),
          false
      );
    } catch (GeminiServiceUnavailableException e) {
      throw e;
    } catch (Exception e) {
      throw new GeminiServiceUnavailableException(
          "AI_SERVICE_UNAVAILABLE",
          "AI Vision analysis is temporarily unavailable. Please verify and enter bill details manually."
      );
    }
  }

  public String generateTransparentAiExplanation(
      LeadEvaluationRequest input,
      LeadScoringOutputDto deterministic
  ) {
    if (apiKey == null || apiKey.isBlank() || "MY_GEMINI_API_KEY".equals(apiKey)) {
      return deterministic.recommendationReason();
    }
    try {
      String prompt = "Write a concise 2-sentence explanation (maximum 420 characters) for a Nagpur rooftop solar customer explaining why this enquiry received its deterministic qualification result.\n"
          + "Ownership: " + input.ownershipType() + "\n"
          + "Monthly Bill: ₹" + input.avgMonthlyBillInr() + "\n"
          + "Monthly Units: " + input.monthlyUnitsKwh() + " kWh\n"
          + "Roof Area: " + input.rooftopAreaSqFt() + " sq ft\n"
          + "Deterministic Score: " + deterministic.totalScore() + "/100 (" + deterministic.category() + ")\n"
          + "Deterministic Capacity: " + deterministic.recommendationLabel() + "\n"
          + "Do NOT change any numbers, scores, or capacities.";

      Map<String, Object> body = Map.of(
          "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt))))
      );

      String endpoint = "https://generativelanguage.googleapis.com/v1beta/models/"
          + modelName + ":generateContent?key=" + apiKey;

      HttpRequest req = HttpRequest.newBuilder()
          .uri(URI.create(endpoint))
          .timeout(Duration.ofSeconds(15))
          .header("Content-Type", "application/json")
          .header("User-Agent", "aistudio-build")
          .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
          .build();

      HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
      if (res.statusCode() >= 200 && res.statusCode() < 300) {
        JsonNode root = objectMapper.readTree(res.body());
        String text = root.path("candidates")
            .path(0)
            .path("content")
            .path("parts")
            .path(0)
            .path("text")
            .asText("")
            .trim();
        if (text.length() >= 20) {
          return truncate(text, 950);
        }
      }
      return deterministic.recommendationReason();
    } catch (Exception ignored) {
      return deterministic.recommendationReason();
    }
  }

  public BillExtractionPayload buildManualFallbackExtraction() {
    return new BillExtractionPayload(
        "",
        "MSEDCL (Mahavitaran)",
        "LT-I Residential",
        0,
        0,
        0,
        "",
        0,
        "LOW_CONFIDENCE",
        "Automated vision service unavailable at scan time. Flagged for mandatory manual verification; no values were guessed.",
        true
    );
  }

  private String truncate(String str, int max) {
    if (str == null) return "";
    return str.length() <= max ? str : str.substring(0, max);
  }
}
