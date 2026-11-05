package com.suryasetu.solar.repository;

import com.suryasetu.solar.entity.SolarQuotationEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SolarQuotationRepository extends JpaRepository<SolarQuotationEntity, String> {
  List<SolarQuotationEntity> findByOwnerUidOrderByCreatedAtDesc(String ownerUid);
  List<SolarQuotationEntity> findAllByOrderByCreatedAtDesc();
}
