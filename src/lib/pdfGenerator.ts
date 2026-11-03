import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { QuotationLineItemDoc, SolarQuotationDoc } from '../types/domain.ts';

function formatInr(amount: number): string {
  return `INR ${Math.round(amount).toLocaleString('en-IN')}`;
}

export function downloadQuotationPdf(
  quotation: SolarQuotationDoc,
  lineItems: QuotationLineItemDoc[],
  leadNumber?: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Top Brand Header Bar (Deep Solar Forest Green #14532D)
  doc.setFillColor(20, 83, 45);
  doc.rect(0, 0, 210, 34, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SuryaSetu Solar EPC Solutions', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Pratap Nagar Ring Road, Nagpur, Maharashtra 440022 | Vidarbha Rooftop Division', 14, 22);
  doc.text('GSTIN: 27AABCS4401R1Z5 (Sample) | Helpline: +91-712-2248900 | proposals@suryasetu.in', 14, 27.5);

  // Quotation Meta Box
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`SOLAR PROPOSAL: ${quotation.quotationNumber}`, 14, 45);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Quotation Date: ${quotation.quotationDate}`, 14, 51.5);
  doc.text(`Valid Until: ${quotation.validUntilDate}`, 78, 51.5);
  doc.text(`Status: ${quotation.status}`, 142, 51.5);

  // Customer & System Specification Summary Table
  autoTable(doc, {
    startY: 57,
    theme: 'grid',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
    },
    head: [['Customer Information', 'Solar Plant Specifications']],
    body: [
      [
        `Customer Name: ${quotation.customerName}\nLead Reference: ${leadNumber || quotation.leadId}\nLocation: ${quotation.city} - ${quotation.pincode}\nProperty Status: ${quotation.ownershipType}`,
        `Recommended Capacity: ${quotation.systemCapacityKw} kW Grid-Connected Rooftop\nModule Package: ${quotation.panelTypeLabel}\nEst. Yearly Generation: ${quotation.annualGenerationUnits.toLocaleString('en-IN')} units (kWh/yr)\nApplicable Tariff Used: INR ${quotation.electricityTariffInr.toFixed(2)} / unit`,
      ],
    ],
  });

  const afterSpecY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 95;

  // Hardware & Installation Line Items
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
    startY: afterSpecY + 6,
    theme: 'striped',
    headStyles: {
      fillColor: [20, 83, 45],
      textColor: [255, 255, 255],
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 10 },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    head: [['#', 'Component', 'Technical Specification', 'Qty', 'Unit Price', 'Amount']],
    body: itemRows,
  });

  const afterItemsY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 145;

  // Financial, Subsidy & ROI Breakdown Table
  const subsidyNote =
    quotation.applicableSubsidyInr > 0
      ? `Sample Configurable Rule (${quotation.appliedRuleSnapshot.subsidyRuleTitle || 'Residential Slab'}): INR 30,000/kW up to 2 kW + INR 18,000 for 3rd kW (Max INR 78,000)`
      : 'INR 0 (Subsidy applicable only to eligible residential homeowner connections)';

  autoTable(doc, {
    startY: afterItemsY + 6,
    theme: 'grid',
    headStyles: {
      fillColor: [240, 253, 244],
      textColor: [20, 83, 45],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
    },
    head: [['Financial, Subsidy & Payback Summary', 'Deterministic Calculation']],
    body: [
      ['Total Turnkey Installation Cost (Equipment + BOS + Installation)', formatInr(quotation.totalInstallationCostInr)],
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

  const afterFinY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220;

  // Terms, Conditions & Rule Snapshot Audit Footer
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Terms, Conditions & Regulatory Disclaimer:', 14, afterFinY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  const terms = [
    '1. Subsidy Disclaimer: Subsidy figures use configurable sample rules stored with effective dates. Actual DBT entitlement is subject to current MNRE / PM Surya Ghar portal verification and DISCOM technical feasibility approval.',
    '2. Warranty: 25-year linear performance warranty on PV modules and 8-year manufacturer warranty on grid-tie string inverter.',
    '3. Payment Milestones: 20% advance upon quotation approval, 70% prior to solar kit dispatch, 10% upon installation & net-meter testing.',
    '4. Validity & Rule Snapshot: Pricing is locked until Valid Until date using Rule Snapshot v' +
      String(quotation.appliedRuleSnapshot.subsidyRuleVersion || 1) +
      ' (' +
      String(quotation.appliedRuleSnapshot.subsidyEffectiveFrom || quotation.quotationDate) +
      ' to ' +
      String(quotation.appliedRuleSnapshot.subsidyEffectiveTo || '2027-12-31') +
      ').',
  ];

  let currY = afterFinY + 13;
  for (const line of terms) {
    const wrapped = doc.splitTextToSize(line, 182);
    doc.text(wrapped, 14, currY);
    currY += wrapped.length * 3.8 + 1.2;
  }

  doc.save(`${quotation.quotationNumber}_${quotation.customerName.replace(/\s+/g, '_')}.pdf`);
}
