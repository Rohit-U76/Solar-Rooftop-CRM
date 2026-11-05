package com.suryasetu.solar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "solar_projects")
public class SolarProjectEntity {

  @Id
  @Column(length = 64)
  private String id;

  @Column(name = "project_number", nullable = false, unique = true, length = 40)
  private String projectNumber;

  @Column(name = "quotation_id", nullable = false, length = 64)
  private String quotationId;

  @Column(name = "lead_id", nullable = false, length = 64)
  private String leadId;

  @Column(name = "owner_uid", nullable = false, length = 128)
  private String ownerUid;

  @Column(name = "customer_name", nullable = false, length = 120)
  private String customerName;

  @Column(nullable = false, length = 80)
  private String city;

  @Column(nullable = false, length = 10)
  private String pincode;

  @Column(name = "system_capacity_kw", nullable = false)
  private double systemCapacityKw;

  @Column(name = "net_customer_cost_inr", nullable = false)
  private int netCustomerCostInr;

  @Column(name = "applicable_subsidy_inr", nullable = false)
  private int applicableSubsidyInr;

  @Column(name = "current_stage", nullable = false, length = 40)
  private String currentStage;

  @Column(name = "stage_index", nullable = false)
  private int stageIndex;

  @Column(name = "pending_activities", length = 500)
  private String pendingActivities;

  @Column(name = "is_delayed", nullable = false)
  private boolean delayed = false;

  @Column(name = "delay_reason", length = 500)
  private String delayReason;

  @Column(name = "tracking_token", nullable = false, unique = true, length = 80)
  private String trackingToken;

  @Column(name = "stage_started_at", nullable = false, length = 32)
  private String stageStartedAt;

  @Column(name = "updated_by_name", length = 120)
  private String updatedByName;

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
  public String getProjectNumber() { return projectNumber; }
  public void setProjectNumber(String projectNumber) { this.projectNumber = projectNumber; }
  public String getQuotationId() { return quotationId; }
  public void setQuotationId(String quotationId) { this.quotationId = quotationId; }
  public String getLeadId() { return leadId; }
  public void setLeadId(String leadId) { this.leadId = leadId; }
  public String getOwnerUid() { return ownerUid; }
  public void setOwnerUid(String ownerUid) { this.ownerUid = ownerUid; }
  public String getCustomerName() { return customerName; }
  public void setCustomerName(String customerName) { this.customerName = customerName; }
  public String getCity() { return city; }
  public void setCity(String city) { this.city = city; }
  public String getPincode() { return pincode; }
  public void setPincode(String pincode) { this.pincode = pincode; }
  public double getSystemCapacityKw() { return systemCapacityKw; }
  public void setSystemCapacityKw(double systemCapacityKw) { this.systemCapacityKw = systemCapacityKw; }
  public int getNetCustomerCostInr() { return netCustomerCostInr; }
  public void setNetCustomerCostInr(int netCustomerCostInr) { this.netCustomerCostInr = netCustomerCostInr; }
  public int getApplicableSubsidyInr() { return applicableSubsidyInr; }
  public void setApplicableSubsidyInr(int applicableSubsidyInr) { this.applicableSubsidyInr = applicableSubsidyInr; }
  public String getCurrentStage() { return currentStage; }
  public void setCurrentStage(String currentStage) { this.currentStage = currentStage; }
  public int getStageIndex() { return stageIndex; }
  public void setStageIndex(int stageIndex) { this.stageIndex = stageIndex; }
  public String getPendingActivities() { return pendingActivities; }
  public void setPendingActivities(String pendingActivities) { this.pendingActivities = pendingActivities; }
  public boolean isDelayed() { return delayed; }
  public void setDelayed(boolean delayed) { this.delayed = delayed; }
  public String getDelayReason() { return delayReason; }
  public void setDelayReason(String delayReason) { this.delayReason = delayReason; }
  public String getTrackingToken() { return trackingToken; }
  public void setTrackingToken(String trackingToken) { this.trackingToken = trackingToken; }
  public String getStageStartedAt() { return stageStartedAt; }
  public void setStageStartedAt(String stageStartedAt) { this.stageStartedAt = stageStartedAt; }
  public String getUpdatedByName() { return updatedByName; }
  public void setUpdatedByName(String updatedByName) { this.updatedByName = updatedByName; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
