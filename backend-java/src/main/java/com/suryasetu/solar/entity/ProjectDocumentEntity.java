package com.suryasetu.solar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "project_documents")
public class ProjectDocumentEntity {

  @Id
  @Column(name = "doc_id", length = 80)
  private String docId;

  @Column(name = "project_id", nullable = false, length = 64)
  private String projectId;

  @Column(name = "owner_uid", nullable = false, length = 128)
  private String ownerUid;

  @Column(name = "assigned_staff_uids_csv", length = 600)
  private String assignedStaffUidsCsv;

  @Column(name = "uploaded_by_uid", nullable = false, length = 128)
  private String uploadedByUid;

  @Column(name = "uploaded_by_name", nullable = false, length = 120)
  private String uploadedByName;

  @Column(name = "doc_type", length = 48)
  private String docType;

  @Column(name = "file_name", nullable = false, length = 160)
  private String fileName;

  @Column(name = "mime_type", nullable = false, length = 48)
  private String mimeType;

  @Column(name = "file_size_bytes", nullable = false)
  private long fileSizeBytes;

  @Column(length = 500)
  private String notes;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @PrePersist
  public void onCreate() {
    if (createdAt == null) createdAt = Instant.now();
  }

  public String getDocId() { return docId; }
  public void setDocId(String docId) { this.docId = docId; }
  public String getProjectId() { return projectId; }
  public void setProjectId(String projectId) { this.projectId = projectId; }
  public String getOwnerUid() { return ownerUid; }
  public void setOwnerUid(String ownerUid) { this.ownerUid = ownerUid; }
  public String getAssignedStaffUidsCsv() { return assignedStaffUidsCsv; }
  public void setAssignedStaffUidsCsv(String assignedStaffUidsCsv) { this.assignedStaffUidsCsv = assignedStaffUidsCsv; }
  public String getUploadedByUid() { return uploadedByUid; }
  public void setUploadedByUid(String uploadedByUid) { this.uploadedByUid = uploadedByUid; }
  public String getUploadedByName() { return uploadedByName; }
  public void setUploadedByName(String uploadedByName) { this.uploadedByName = uploadedByName; }
  public String getDocType() { return docType; }
  public void setDocType(String docType) { this.docType = docType; }
  public String getFileName() { return fileName; }
  public void setFileName(String fileName) { this.fileName = fileName; }
  public String getMimeType() { return mimeType; }
  public void setMimeType(String mimeType) { this.mimeType = mimeType; }
  public long getFileSizeBytes() { return fileSizeBytes; }
  public void setFileSizeBytes(long fileSizeBytes) { this.fileSizeBytes = fileSizeBytes; }
  public String getNotes() { return notes; }
  public void setNotes(String notes) { this.notes = notes; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
