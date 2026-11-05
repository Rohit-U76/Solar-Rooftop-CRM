import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  buildMultiOptionComparison,
  type QuotationComparisonOption,
} from '../shared/solarEngine.ts';
import type { QuotationLineItemDoc, SolarQuotationDoc } from '../types/domain.ts';

function formatInr(amount: number): string {
  return `INR ${Math.round(amount).toLocaleString('en-IN')}`;
}

/**
 * Deterministically reconstructs the 1 kW, 2 kW, 3 kW, and Suitable Alternative options
 * from the quotation's immutable `appliedRuleSnapshot` so historical proposals preserve
 * their locked pricing and subsidy math even after admin rules change.
 */
export function buildSnapshotComparisonOptions(
  quotation: SolarQuotationDoc
): QuotationComparisonOption[] {
  const snap = quotation.appliedRuleSnapshot || {};
  const annualGenPerKw = Number(snap.annualGenPerKw || 1400);
  const panelPricePerKwInr =
    Number(snap.panelPricePerKwInr || 0) > 0
      ? Number(snap.panelPricePerKwInr)
      : Math.round(quotation.equipmentCostInr / Math.max(1, quotation.systemCapacityKw));
  const bosFlatInr = Number(snap.bosFlatInr ?? 12000);
  const installationPerKwInr =
    Number(snap.installationPerKwInr || 0) > 0
      ? Number(snap.installationPerKwInr)
      : Math.max(
          0,
          Math.round(
            (quotation.installationChargesInr - bosFlatInr) / Math.max(1, quotation.systemCapacityKw)
          )
        );
  const isResidentialTariff =
    snap.isResidentialTariff !== undefined
      ? Boolean(snap.isResidentialTariff)
      : quotation.applicableSubsidyInr > 0 || quotation.ownershipType === 'TENANT';

  return buildMultiOptionComparison(
    {
      systemCapacityKw: quotation.systemCapacityKw,
      ownershipType: quotation.ownershipType,
      isResidentialTariff,
      panelPricePerKwInr,
      annualGenPerKw,
      installationPerKwInr,
      bosAndNetMeteringFlatInr: bosFlatInr,
      electricityTariffInr: quotation.electricityTariffInr,
      subsidyRule: {
        firstTierMaxKw: Number(snap.subsidyFirstTierMaxKw ?? 2),
        firstTierRateInr: Number(snap.subsidyFirstTierRateInr ?? 30000),
        secondTierMaxKw: Number(snap.subsidySecondTierMaxKw ?? 3),
        secondTierRateInr: Number(snap.subsidySecondTierRateInr ?? 18000),
        maxSubsidyCapInr: Number(snap.subsidyMaxCapInr ?? 78000),
        residentialOnly:
          snap.subsidyResidentialOnly !== undefined ? Boolean(snap.subsidyResidentialOnly) : true,
      },
    },
    quotation.systemCapacityKw
  );
}

export function downloadQuotationPdf(
  quotation: SolarQuotationDoc,
  lineItems: QuotationLineItemDoc[],
  leadNumber?: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Top Brand Header Bar (Deep Solar Forest Green #14532D + Slate Blue Accent Strip #0369A1)
  doc.setFillColor(20, 83, 45);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setFillColor(3, 105, 161);
  doc.rect(0, 32, 210, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('SuryaSetu Solar EPC Solutions', 14, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Pratap Nagar Ring Road, Nagpur, Maharashtra 440022 | Vidarbha Rooftop Solar Division', 14, 20.5);
  doc.text('GSTIN: 27AABCS4401R1Z5 (Sample) | Helpline: +91-712-2248900 | proposals@suryasetu.in', 14, 26);

  // Quotation Header & Validity Meta
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text(`COMMERCIAL SOLAR QUOTATION: ${quotation.quotationNumber}`, 14, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Issue Date: ${quotation.quotationDate}`, 14, 48);
  doc.text(`Valid Until: ${quotation.validUntilDate}`, 74, 48);
  doc.text(`Approval Status: ${quotation.status}`, 136, 48);

  // 1. Customer & Selected Solar Plant Specification Summary
  autoTable(doc, {
    startY: 52,
    theme: 'grid',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    head: [['Customer & Site Information', 'Selected Solar Plant Specifications']],
    body: [
      [
        `Customer Name: ${quotation.customerName}\nLead Reference: ${leadNumber || quotation.leadId}\nLocation: ${quotation.city} - ${quotation.pincode}\nProperty Ownership: ${quotation.ownershipType}`,
        `Selected Capacity: ${quotation.systemCapacityKw} kW Grid-Connected Rooftop\nModule Package: ${quotation.panelTypeLabel}\nEst. Yearly Generation: ${quotation.annualGenerationUnits.toLocaleString('en-IN')} units (kWh/yr)\nApplicable Tariff Used: INR ${quotation.electricityTariffInr.toFixed(2)} / unit`,
      ],
    ],
  });

  const afterSpecY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 84;

  // 2. Multi-Option Comparison Table (1 kW, 2 kW, 3 kW & Suitable Alternative)
  const comparisonOptions = buildSnapshotComparisonOptions(quotation);
  const optionRows = comparisonOptions.map((opt) => [
    `${opt.optionLabel}${opt.isSelected ? ' [SELECTED]' : ''}`,
    `${opt.annualGenerationUnits.toLocaleString('en-IN')} kWh`,
    formatInr(opt.totalInstallationCostInr),
    opt.applicableSubsidyInr > 0 ? `- ${formatInr(opt.applicableSubsidyInr)}` : 'INR 0',
    formatInr(opt.netCustomerCostInr),
    `${formatInr(opt.estimatedAnnualSavingsInr)}/yr`,
    `${opt.estimatedPaybackYears} yrs`,
  ]);

  autoTable(doc, {
    startY: afterSpecY + 5,
    theme: 'grid',
    headStyles: {
      fillColor: [3, 105, 161],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    head: [
      [
        'Solar Option (1 / 2 / 3 kW / Alt)',
        'Yearly Gen',
        'Gross Price',
        'Subsidy*',
        'Net Cost',
        'Est. Savings',
        'Payback',
      ],
    ],
    body: optionRows,
  });

  const afterCompY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 128;

  // 3. Hardware & Installation Line Items for Selected Option
  const itemRows =
    lineItems.length > 0
      ? lineItems.map((item, idx) => [
          String(idx + 1),
          item.itemName,
          item.specification,
          String(item.quantity),
          formatInr(item.unitPriceInr),
          formatInr(item.lineTotalInr),
        ])
      : [
          [
            '1',
            `Solar PV Modules & On-Grid Inverter (${quotation.systemCapacityKw} kW)`,
            quotation.panelTypeLabel,
            '1 Lot',
            formatInr(quotation.equipmentCostInr),
            formatInr(quotation.equipmentCostInr),
          ],
          [
            '2',
            'Hot-Dip Galvanized Structure, ACDB/DCDB, Earthing & MSEDCL Net Metering',
            'Complete turnkey installation, testing & commissioning across Vidarbha',
            '1 Lot',
            formatInr(quotation.installationChargesInr),
            formatInr(quotation.installationChargesInr),
          ],
        ];

  autoTable(doc, {
    startY: afterCompY + 5,
    theme: 'striped',
    headStyles: {
      fillColor: [20, 83, 45],
      textColor: [255, 255, 255],
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 8 },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    head: [['#', 'Selected Option Component', 'Technical Specification', 'Qty', 'Unit Price', 'Amount']],
    body: itemRows,
  });

  const afterItemsY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 172;

  // 4. Deterministic Financial, Subsidy & Payback Summary
  const subsidyNote =
    quotation.applicableSubsidyInr > 0
      ? `Configurable Rule (${quotation.appliedRuleSnapshot.subsidyRuleTitle || 'Residential Slab'}): INR ${Number(quotation.appliedRuleSnapshot.subsidyFirstTierRateInr ?? 30000).toLocaleString('en-IN')}/kW first ${quotation.appliedRuleSnapshot.subsidyFirstTierMaxKw ?? 2} kW + INR ${Number(quotation.appliedRuleSnapshot.subsidySecondTierRateInr ?? 18000).toLocaleString('en-IN')} next slab (Cap INR ${Number(quotation.appliedRuleSnapshot.subsidyMaxCapInr ?? 78000).toLocaleString('en-IN')})`
      : 'INR 0 (Subsidy applicable only to eligible residential homeowner connections)';

  autoTable(doc, {
    startY: afterItemsY + 5,
    theme: 'grid',
    headStyles: {
      fillColor: [240, 253, 244],
      textColor: [20, 83, 45],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8.2,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
    },
    head: [['Selected Option Financial & Payback Summary', 'Deterministic Calculation']],
    body: [
      [
        'Gross Turnkey Installation Price (Equipment + BOS + Net Metering)',
        formatInr(quotation.totalInstallationCostInr),
      ],
      [`Less: Applicable Government Subsidy*\n${subsidyNote}`, `- ${formatInr(quotation.applicableSubsidyInr)}`],
      ['Final Net Customer Investment (After Subsidy)', formatInr(quotation.netCustomerCostInr)],
      [
        `Estimated Annual Solar Generation (${quotation.systemCapacityKw} kW x ${quotation.appliedRuleSnapshot.annualGenPerKw || 1400} units/kW)`,
        `${quotation.annualGenerationUnits.toLocaleString('en-IN')} kWh / year`,
      ],
      [
        `Estimated Annual Electricity Bill Savings (${quotation.selfConsumptionUnits.toLocaleString('en-IN')} units x INR ${quotation.electricityTariffInr})`,
        `${formatInr(quotation.estimatedAnnualSavingsInr)} / year`,
      ],
      ['Estimated Simple Payback Period (Net Cost / Annual Savings)', `${quotation.estimatedPaybackYears} Years`],
    ],
  });

  const afterFinY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 232;

  // 5. Customer Acceptance, Validity & Regulatory Audit Footer
  let currY = afterFinY + 6;
  if (currY > 262) {
    doc.addPage();
    currY = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Quotation Validity, Customer Approval & Regulatory Terms:', 14, currY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(71, 85, 105);
  const terms = [
    `1. Proposal Validity & Customer Approval: Valid until ${quotation.validUntilDate}. Current Customer Approval Status: ${quotation.status}.`,
    '2. Subsidy Disclaimer: Subsidy figures are computed deterministically from configurable rules with effective dates. Actual DBT release is subject to MNRE / PM Surya Ghar portal verification and MSEDCL technical feasibility.',
    '3. Warranty & Milestones: 25-year linear performance warranty on PV modules; 8-year inverter warranty. Payment schedule: 20% booking advance, 70% prior to dispatch, 10% at commissioning.',
    '4. Locked Historical Rule Snapshot: Rule v' +
      String(quotation.appliedRuleSnapshot.subsidyRuleVersion || 1) +
      ' (' +
      String(quotation.appliedRuleSnapshot.subsidyEffectiveFrom || quotation.quotationDate) +
      ' to ' +
      String(quotation.appliedRuleSnapshot.subsidyEffectiveTo || '2027-12-31') +
      '). Future pricing updates do not alter this issued proposal.',
  ];

  currY += 4.5;
  for (const line of terms) {
    const wrapped = doc.splitTextToSize(line, 182);
    doc.text(wrapped, 14, currY);
    currY += wrapped.length * 3.4 + 1;
  }

  doc.save(`${quotation.quotationNumber}_${quotation.customerName.replace(/\s+/g, '_')}.pdf`);
}
