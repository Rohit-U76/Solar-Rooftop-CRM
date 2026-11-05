package com.suryasetu.solar.repository;

import com.suryasetu.solar.entity.SolarLeadEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SolarLeadRepository extends JpaRepository<SolarLeadEntity, String> {
  List<SolarLeadEntity> findByOwnerUidOrderByCreatedAtDesc(String ownerUid);
  List<SolarLeadEntity> findAllByOrderByCreatedAtDesc();
}
