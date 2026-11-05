package com.suryasetu.solar.repository;

import com.suryasetu.solar.entity.SolarProjectEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SolarProjectRepository extends JpaRepository<SolarProjectEntity, String> {
  List<SolarProjectEntity> findByOwnerUidOrderByCreatedAtDesc(String ownerUid);
  List<SolarProjectEntity> findAllByOrderByCreatedAtDesc();
  Optional<SolarProjectEntity> findByTrackingToken(String trackingToken);
}
