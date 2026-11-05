package com.suryasetu.solar.repository;

import com.suryasetu.solar.entity.BillExtractionEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BillExtractionRepository extends JpaRepository<BillExtractionEntity, String> {
  List<BillExtractionEntity> findByLeadIdOrderByCreatedAtDesc(String leadId);
}
