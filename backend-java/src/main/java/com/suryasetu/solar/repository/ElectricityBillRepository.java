package com.suryasetu.solar.repository;

import com.suryasetu.solar.entity.ElectricityBillEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ElectricityBillRepository extends JpaRepository<ElectricityBillEntity, String> {
  List<ElectricityBillEntity> findByOwnerUidOrderByCreatedAtDesc(String ownerUid);
}
