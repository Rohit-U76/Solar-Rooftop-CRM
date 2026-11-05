package com.suryasetu.solar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "solar_leads")
public class SolarLeadEntity {

  @Id
  @Column(length = 64)
  private String id;

  @Column(name = "lead_number", nullable = false, unique = true, length = 32)
  private String leadNumber;

  @Column(name = "owner_uid", nullable = false, length = 128)
  private String ownerUid;

  @Column(name = "customer_name", nullable = false, length = 120)
  private String customerName;

  @Column(name = "mobile_number", nullable = false, length = 20)
  private String mobileNumber;

  @Column(length = 160)
  private String email;

  @Column(name = "dpdp_consent", nullable = false)
  private boolean dpdpConsent = true;

  @Column(name = "ownership_type", nullable = false, length = 16)
  private String ownershipType;

  @Column(name = "roof_type", nullable = false, length = 24)
  private String roofType;

  @Column(name = "rooftop_area_sq_ft", nullable = false)
  private double rooftopAreaSqFt;

  @Column(name = "avg_monthly_bill_inr", nullable = false)
  private double avgMonthlyBillInr;

  @Column(name = "average_units_kwh", nullable = false)
  private double averageUnitsKwh;

  @Column(name = "sanctioned_load_kw", nullable = false)
  private double sanctionedLoadKw;

  @Column(nullable = false, length = 10)
  private String pincode;

  @Column(nullable = false, length = 80)
  private String city;

  @Column(name = "qualification_category", nullable = false, length = 16)
  private String qualificationCategory;

  @Column(name = "lead_score", nullable = false)
  private int leadScore;

  @Column(name = "recommended_capacity_kw", nullable = false)
  private double recommendedCapacityKw;

  @Column(name = "recommendation_label", nullable = false, length = 64)
  private String recommendationLabel;

  @Column(name = "recommendation_reason", length = 1000)
  private String recommendationReason;

  @Column(name = "next_recommended_action", length = 500)
  private String nextRecommendedAction;

  @Column(name = "survey_status", nullable = false, length = 32)
  private String surveyStatus;

  @Column(name = "lead_stage", nullable = false, length = 32)
  private String leadStage;

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
  public String getLeadNumber() { return leadNumber; }
  public void setLeadNumber(String leadNumber) { this.leadNumber = leadNumber; }
  public String getOwnerUid() { return ownerUid; }
  public void setOwnerUid(String ownerUid) { this.ownerUid = ownerUid; }
  public String getCustomerName() { return customerName; }
  public void setCustomerName(String customerName) { this.customerName = customerName; }
  public String getMobileNumber() { return mobileNumber; }
  public void setMobileNumber(String mobileNumber) { this.mobileNumber = mobileNumber; }
  public String getEmail() { return email; }
  public void setEmail(String email) { this.email = email; }
  public boolean isDpdpConsent() { return dpdpConsent; }
  public void setDpdpConsent(boolean dpdpConsent) { this.dpdpConsent = dpdpConsent; }
  public String getOwnershipType() { return ownershipType; }
  public void setOwnershipType(String ownershipType) { this.ownershipType = ownershipType; }
  public String getRoofType() { return roofType; }
  public void setRoofType(String roofType) { this.roofType = roofType; }
  public double getRooftopAreaSqFt() { return rooftopAreaSqFt; }
  public void setRooftopAreaSqFt(double rooftopAreaSqFt) { this.rooftopAreaSqFt = rooftopAreaSqFt; }
  public double getAvgMonthlyBillInr() { return avgMonthlyBillInr; }
  public void setAvgMonthlyBillInr(double avgMonthlyBillInr) { this.avgMonthlyBillInr = avgMonthlyBillInr; }
  public double getAverageUnitsKwh() { return averageUnitsKwh; }
  public void setAverageUnitsKwh(double averageUnitsKwh) { this.averageUnitsKwh = averageUnitsKwh; }
  public double getSanctionedLoadKw() { return sanctionedLoadKw; }
  public void setSanctionedLoadKw(double sanctionedLoadKw) { this.sanctionedLoadKw = sanctionedLoadKw; }
  public String getPincode() { return pincode; }
  public void setPincode(String pincode) { this.pincode = pincode; }
  public String getCity() { return city; }
  public void setCity(String city) { this.city = city; }
  public String getQualificationCategory() { return qualificationCategory; }
  public void setQualificationCategory(String qualificationCategory) { this.qualificationCategory = qualificationCategory; }
  public int getLeadScore() { return leadScore; }
  public void setLeadScore(int leadScore) { this.leadScore = leadScore; }
  public double getRecommendedCapacityKw() { return recommendedCapacityKw; }
  public void setRecommendedCapacityKw(double recommendedCapacityKw) { this.recommendedCapacityKw = recommendedCapacityKw; }
  public String getRecommendationLabel() { return recommendationLabel; }
  public void setRecommendationLabel(String recommendationLabel) { this.recommendationLabel = recommendationLabel; }
  public String getRecommendationReason() { return recommendationReason; }
  public void setRecommendationReason(String recommendationReason) { this.recommendationReason = recommendationReason; }
  public String getNextRecommendedAction() { return nextRecommendedAction; }
  public void setNextRecommendedAction(String nextRecommendedAction) { this.nextRecommendedAction = nextRecommendedAction; }
  public String getSurveyStatus() { return surveyStatus; }
  public void setSurveyStatus(String surveyStatus) { this.surveyStatus = surveyStatus; }
  public String getLeadStage() { return leadStage; }
  public void setLeadStage(String leadStage) { this.leadStage = leadStage; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
