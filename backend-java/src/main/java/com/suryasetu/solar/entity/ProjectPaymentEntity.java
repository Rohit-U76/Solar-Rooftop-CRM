package com.suryasetu.solar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "project_payments")
public class ProjectPaymentEntity {

  @Id
  @Column(length = 64)
  private String id;

  @Column(name = "project_id", nullable = false, length = 64)
  private String projectId;

  @Column(name = "owner_uid", nullable = false, length = 128)
  private String ownerUid;

  @Column(name = "payment_reference", nullable = false, length = 64)
  private String paymentReference;

  @Column(nullable = false, length = 40)
  private String milestone;

  @Column(name = "amount_inr", nullable = false)
  private int amountInr;

  @Column(name = "payment_mode", nullable = false, length = 32)
  private String paymentMode;

  @Column(name = "is_simulation", nullable = false)
  private boolean simulation = true;

  @Column(name = "recorded_by_uid", nullable = false, length = 128)
  private String recordedByUid;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @PrePersist
  public void onCreate() {
    if (createdAt == null) createdAt = Instant.now();
  }

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getProjectId() { return projectId; }
  public void setProjectId(String projectId) { this.projectId = projectId; }
  public String getOwnerUid() { return ownerUid; }
  public void setOwnerUid(String ownerUid) { this.ownerUid = ownerUid; }
  public String getPaymentReference() { return paymentReference; }
  public void setPaymentReference(String paymentReference) { this.paymentReference = paymentReference; }
  public String getMilestone() { return milestone; }
  public void setMilestone(String milestone) { this.milestone = milestone; }
  public int getAmountInr() { return amountInr; }
  public void setAmountInr(int amountInr) { this.amountInr = amountInr; }
  public String getPaymentMode() { return paymentMode; }
  public void setPaymentMode(String paymentMode) { this.paymentMode = paymentMode; }
  public boolean isSimulation() { return simulation; }
  public void setSimulation(boolean simulation) { this.simulation = simulation; }
  public String getRecordedByUid() { return recordedByUid; }
  public void setRecordedByUid(String recordedByUid) { this.recordedByUid = recordedByUid; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
