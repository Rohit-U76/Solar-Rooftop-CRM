package com.suryasetu.solar.service;

import com.suryasetu.solar.entity.ElectricityBillEntity;
import com.suryasetu.solar.entity.ProjectDocumentEntity;
import com.suryasetu.solar.repository.ElectricityBillRepository;
import com.suryasetu.solar.repository.ProjectDocumentRepository;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class FileStorageService {

  private final Path billStorageDir;
  private final Path projectDocStorageDir;
  private final Path sampleAssetsDir;
  private final ElectricityBillRepository billRepository;
  private final ProjectDocumentRepository projectDocumentRepository;
  private final SecureRandom secureRandom = new SecureRandom();

  public FileStorageService(
      @Value("${suryasetu.storage.root-dir:.data}") String rootDir,
      @Value("${suryasetu.storage.sample-assets-dir:../src/assets/images}") String sampleAssetsDir,
      ElectricityBillRepository billRepository,
      ProjectDocumentRepository projectDocumentRepository
  ) {
    this.billStorageDir = Paths.get(rootDir, "bills").toAbsolutePath().normalize();
    this.projectDocStorageDir = Paths.get(rootDir, "project_docs").toAbsolutePath().normalize();
    this.sampleAssetsDir = Paths.get(sampleAssetsDir).toAbsolutePath().normalize();
    this.billRepository = billRepository;
    this.projectDocumentRepository = projectDocumentRepository;
  }

  public record StoredFilePayload(byte[] bytes, String mimeType, String fileName) {}

  @PostConstruct
  public void ensureDirectories() throws IOException {
    Files.createDirectories(billStorageDir);
    Files.createDirectories(projectDocStorageDir);
  }

  public byte[] decodeBase64Payload(String base64Data) {
    String clean = base64Data.contains(",")
        ? base64Data.substring(base64Data.indexOf(',') + 1)
        : base64Data;
    return Base64.getDecoder().decode(clean);
  }

  public ElectricityBillEntity storeElectricityBill(
      String ownerUid,
      String rawFileName,
      String mimeType,
      byte[] bytes
  ) throws IOException {
    byte[] rand = new byte[12];
    secureRandom.nextBytes(rand);
    String storageKey = "bill_" + HexFormat.of().formatHex(rand);
    String safeFileName = sanitizeFileName(rawFileName, 120);

    Files.write(billStorageDir.resolve(storageKey + ".bin"), bytes);

    ElectricityBillEntity entity = new ElectricityBillEntity();
    entity.setStorageKey(storageKey);
    entity.setOwnerUid(ownerUid);
    entity.setFileName(safeFileName);
    entity.setMimeType(mimeType);
    entity.setFileSizeBytes(bytes.length);
    entity.setStorageRef("upload:" + storageKey);
    return billRepository.save(entity);
  }

  public Optional<ElectricityBillEntity> findBillMetadata(String storageKey) {
    return billRepository.findById(storageKey);
  }

  public StoredFilePayload resolveBillBinary(String storageRef) throws IOException {
    if (storageRef != null && storageRef.startsWith("upload:")) {
      String key = storageRef.substring("upload:".length());
      if (!key.matches("^[a-zA-Z0-9_-]{8,80}$")) {
        throw new IllegalArgumentException("Invalid bill storage key.");
      }
      ElectricityBillEntity meta = billRepository.findById(key)
          .orElseThrow(() -> new IllegalArgumentException("Electricity bill file not found."));
      Path binPath = billStorageDir.resolve(key + ".bin").normalize();
      if (!Files.exists(binPath)) {
        throw new IllegalArgumentException("Electricity bill binary file missing on disk.");
      }
      return new StoredFilePayload(Files.readAllBytes(binPath), meta.getMimeType(), meta.getFileName());
    }

    if (storageRef != null && storageRef.startsWith("/src/assets/images/sample_bill_")) {
      String fileName = Paths.get(storageRef).getFileName().toString();
      Path target = sampleAssetsDir.resolve(fileName).normalize();
      if (!target.startsWith(sampleAssetsDir) || !Files.exists(target)) {
        throw new IllegalArgumentException("Sample electricity bill asset not found.");
      }
      return new StoredFilePayload(Files.readAllBytes(target), "image/jpeg", fileName);
    }

    throw new IllegalArgumentException("Unsupported electricity bill reference.");
  }

  public ProjectDocumentEntity storeProjectDocument(
      String projectId,
      String docId,
      String ownerUid,
      List<String> assignedStaffUids,
      String uploadedByUid,
      String uploadedByName,
      String docType,
      String rawFileName,
      String mimeType,
      String notes,
      byte[] bytes
  ) throws IOException {
    String safeFileName = sanitizeFileName(rawFileName, 140);
    Path binPath = projectDocStorageDir.resolve(projectId + "__" + docId + ".bin").normalize();
    Files.write(binPath, bytes);

    ProjectDocumentEntity entity = new ProjectDocumentEntity();
    entity.setDocId(docId);
    entity.setProjectId(projectId);
    entity.setOwnerUid(ownerUid);
    entity.setAssignedStaffUidsCsv(
        assignedStaffUids != null ? String.join(",", assignedStaffUids) : ""
    );
    entity.setUploadedByUid(uploadedByUid);
    entity.setUploadedByName(uploadedByName);
    entity.setDocType(docType != null ? docType : "SITE_SURVEY_REPORT");
    entity.setFileName(safeFileName);
    entity.setMimeType(mimeType);
    entity.setFileSizeBytes(bytes.length);
    entity.setNotes(notes != null ? notes : "");
    return projectDocumentRepository.save(entity);
  }

  public Optional<ProjectDocumentEntity> findProjectDocumentMeta(String projectId, String docId) {
    return projectDocumentRepository.findByProjectIdAndDocId(projectId, docId);
  }

  public byte[] readProjectDocumentBytes(String projectId, String docId) throws IOException {
    Path binPath = projectDocStorageDir.resolve(projectId + "__" + docId + ".bin").normalize();
    if (!Files.exists(binPath)) {
      throw new IllegalArgumentException("Uploaded binary file not found for this document record.");
    }
    return Files.readAllBytes(binPath);
  }

  private String sanitizeFileName(String name, int maxLen) {
    String cleaned = (name == null ? "document" : name).replaceAll("[^a-zA-Z0-9._-]", "_");
    return cleaned.length() <= maxLen ? cleaned : cleaned.substring(0, maxLen);
  }
}
