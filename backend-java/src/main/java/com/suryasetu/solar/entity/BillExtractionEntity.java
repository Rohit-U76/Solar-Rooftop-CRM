package com.suryasetu.solar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "bill_extractions")
public class BillExtractionEntity {

  @Id
  @Column(length = 64)
  private String id;

  @Column(name = "lead_id", length = 64)
  private String leadId;

  @Column(name = "storage_ref", nullable = false, length = 140)
  private String storageRef;

  @Column(name = "owner_uid", nullable = false, length = 128)
  private String ownerUid;

  @Column(name = "consumer_number", nullable = false, length = 64)
  private String consumerNumber;

  @Column(name = "discom_name", nullable = false, length = 120)
  private String discomName;

  @Column(name = "tariff_category", nullable = false, length = 80)
  private String tariffCategory;

  @Column(name = "sanctioned_load_kw", nullable = false)
  private double sanctionedLoadKw;

  @Column(name = "monthly_units_kwh", nullable = false)
  private double monthlyUnitsKwh;

  @Column(name = "billing_amount_inr", nullable = false)
  private double billingAmountInr;

  @Column(name = "billing_period", nullable = false, length = 80)
  private String billingPeriod;

  @Column(name = "confidence_score", nullable = false)
  private int confidenceScore;

  @Column(name = "clarity_status", nullable = false, length = 32)
  private String clarityStatus;

  @Column(name = "verification_status", nullable = false, length = 32)
  private String verificationStatus;

  @Column(name = "extraction_notes", length = 650)
  private String extractionNotes;

  @Column(name = "verified_by_uid", length = 128)
  private String verifiedByUid;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @PrePersist
  public void onCreate() {
    Instant now = Instant.now();
    if (createdAt == null) createdAt = now;
    updatedAt = now;
  }

  @PreUpdate
  public void onUpdate() {
    updatedAt = Instant.now();
  }

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getLeadId() { return leadId; }
  public void setLeadId(String leadId) { this.leadId = leadId; }
  public String getStorageRef() { return storageRef; }
  public void setStorageRef(String storageRef) { this.storageRef = storageRef; }
  public String getOwnerUid() { return ownerUid; }
  public void setOwnerUid(String ownerUid) { this.ownerUid = ownerUid; }
  public String getConsumerNumber() { return consumerNumber; }
  public void setConsumerNumber(String consumerNumber) { this.consumerNumber = consumerNumber; }
  public String getDiscomName() { return discomName; }
  public void setDiscomName(String discomName) { this.discomName = discomName; }
  public String getTariffCategory() { return tariffCategory; }
  public void setTariffCategory(String tariffCategory) { this.tariffCategory = tariffCategory; }
  public double getSanctionedLoadKw() { return sanctionedLoadKw; }
  public void setSanctionedLoadKw(double sanctionedLoadKw) { this.sanctionedLoadKw = sanctionedLoadKw; }
  public double getMonthlyUnitsKwh() { return monthlyUnitsKwh; }
  public void setMonthlyUnitsKwh(double monthlyUnitsKwh) { this.monthlyUnitsKwh = monthlyUnitsKwh; }
  public double getbillingAmountInr() { return billingAmountInr; }
  public double getBillingAmountInr() { return billingAmountInr; }
  public void setBillingAmountInr(double billingAmountInr) { this.billingAmountInr = billingAmountInr; }
  public String getBillingPeriod() { return billingPeriod; }
  public void setBillingPeriod(String billingPeriod) { this.billingPeriod = billingPeriod; }
  public int getConfidenceScore() { return confidenceScore; }
  public void setConfidenceScore(int confidenceScore) { this.confidenceScore = confidenceScore; }
  public String getClarityStatus() { return clarityStatus; }
  public void setClarityStatus(String clarityStatus) { this.clarityStatus = clarityStatus; }
  public String getVerificationStatus() { return verificationStatus; }
  public void setVerificationStatus(String verificationStatus) { this.verificationStatus = verificationStatus; }
  public String getExtractionNotes() { return extractionNotes; }
  public void setExtractionNotes(String extractionNotes) { this.extractionNotes = extractionNotes; }
  public String getVerifiedByUid() { return verifiedByUid; }
  public void setVerifiedByUid(String verifiedByUid) { this.verifiedByUid = verifiedByUid; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
