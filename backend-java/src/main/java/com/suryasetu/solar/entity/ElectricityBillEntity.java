package com.suryasetu.solar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "electricity_bills")
public class ElectricityBillEntity {

  @Id
  @Column(name = "storage_key", length = 80)
  private String storageKey;

  @Column(name = "lead_id", length = 64)
  private String leadId;

  @Column(name = "owner_uid", nullable = false, length = 128)
  private String ownerUid;

  @Column(name = "file_name", nullable = false, length = 160)
  private String fileName;

  @Column(name = "mime_type", nullable = false, length = 40)
  private String mimeType;

  @Column(name = "file_size_bytes", nullable = false)
  private long fileSizeBytes;

  @Column(name = "storage_ref", nullable = false, length = 120)
  private String storageRef;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @PrePersist
  public void onCreate() {
    if (createdAt == null) createdAt = Instant.now();
  }

  public String getStorageKey() { return storageKey; }
  public void setStorageKey(String storageKey) { this.storageKey = storageKey; }
  public String getLeadId() { return leadId; }
  public void setLeadId(String leadId) { this.leadId = leadId; }
  public String getOwnerUid() { return ownerUid; }
  public void setOwnerUid(String ownerUid) { this.ownerUid = ownerUid; }
  public String getFileName() { return fileName; }
  public void setFileName(String fileName) { this.fileName = fileName; }
  public String getMimeType() { return mimeType; }
  public void setMimeType(String mimeType) { this.mimeType = mimeType; }
  public long getFileSizeBytes() { return fileSizeBytes; }
  public void setFileSizeBytes(long fileSizeBytes) { this.fileSizeBytes = fileSizeBytes; }
  public String getStorageRef() { return storageRef; }
  public void setStorageRef(String storageRef) { this.storageRef = storageRef; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
