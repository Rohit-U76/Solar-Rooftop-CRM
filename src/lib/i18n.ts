import type { SupportedLanguage } from '../types/domain.ts';

export interface TranslationDictionary {
  brandTitle: string;
  navDashboard: string;
  navLeads: string;
  navQuotations: string;
  navProjects: string;
  navNotifications: string;
  navConfig: string;
  navEnquiry: string;
  navMySolar: string;
  ctaNewEnquiry: string;
  heroHeading: string;
  heroSubheading: string;
  submitEnquiry: string;
  ownerLabel: string;
  tenantLabel: string;
  billUploadHint: string;
  // AppShell & RBAC
  switchToSales: string;
  switchToHomeowner: string;
  signOut: string;
  roleAdmin: string;
  roleSales: string;
  roleHomeowner: string;
  homeownerPortalLabel: string;
  themeLightLabel: string;
  themeDarkLabel: string;
  // Lead Intake Form
  leadFormHeading: string;
  leadFormSubheading: string;
  customerNameLabel: string;
  mobileLabel: string;
  emailOptionalLabel: string;
  pincodeLabel: string;
  ownershipStatusLabel: string;
  roofTypeLabel: string;
  roofAreaLabel: string;
  monthlyBillLabel: string;
  dpdpConsentLabel: string;
  submitAndScanBtn: string;
  // Bill Analysis & PII Protection
  billVerifyHeading: string;
  originalBillTitle: string;
  extractedBillTitle: string;
  unclearBillTitle: string;
  unclearBillDesc: string;
  confirmBillBtn: string;
  verifyLockBtn: string;
  showFullPii: string;
  maskPii: string;
  // Quotations & Multi-Option Matrix
  multiOptionTitle: string;
  multiOptionSub: string;
  validityWindowLabel: string;
  issueQuotationBtn: string;
  saveDraftBtn: string;
  approveProposalBtn: string;
  declineProposalBtn: string;
  // Projects, Admin & Analytics
  projectLifecycleTitle: string;
  adminReadOnlyNotice: string;
  auditHistoryTitle: string;
  pipelineFiltersTitle: string;
  delayedWatchlistTitle: string;
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    brandTitle: 'SuryaSetu',
    navDashboard: 'Dashboard',
    navLeads: 'Leads',
    navQuotations: 'Quotations',
    navProjects: 'Projects',
    navNotifications: 'Notifications',
    navConfig: 'Pricing & Rules',
    navEnquiry: 'New Solar Enquiry',
    navMySolar: 'My Applications',
    ctaNewEnquiry: 'Submit Enquiry',
    heroHeading: 'Rooftop Solar Qualification & Project Operations for Vidarbha',
    heroSubheading:
      'Upload your electricity bill for instant AI consumption reading, transparent rooftop sizing, deterministic subsidy calculation, and milestone tracking across Nagpur and Vidarbha.',
    submitEnquiry: 'Submit Solar Enquiry',
    ownerLabel: 'Property Owner',
    tenantLabel: 'Tenant / Rented',
    billUploadHint: 'Upload clear JPEG, PNG, or WebP photo of your MSEDCL / utility bill (max 5 MB).',
    switchToSales: 'Sales Staff Console',
    switchToHomeowner: 'Homeowner View',
    signOut: 'Sign Out',
    roleAdmin: 'Administrator',
    roleSales: 'Sales Staff',
    roleHomeowner: 'Homeowner',
    homeownerPortalLabel: 'Homeowner Portal',
    themeLightLabel: 'Light',
    themeDarkLabel: 'Dark',
    leadFormHeading: 'Submit Rooftop Solar Installation Enquiry',
    leadFormSubheading:
      'Complete your property profile below and attach a clear photo of your MSEDCL / utility electricity bill for instant AI consumption reading.',
    customerNameLabel: 'Customer Full Name *',
    mobileLabel: '10-Digit Mobile Number *',
    emailOptionalLabel: 'Email Address (Optional)',
    pincodeLabel: 'Installation Pincode *',
    ownershipStatusLabel: 'Property Ownership Status *',
    roofTypeLabel: 'Rooftop Structure Type *',
    roofAreaLabel: 'Shadow-Free Rooftop Area (sq ft) *',
    monthlyBillLabel: 'Average Monthly Electricity Bill (₹) *',
    dpdpConsentLabel:
      'I consent to SuryaSetu processing my contact information and uploaded electricity bill solely for rooftop solar sizing, quotation generation, and DISCOM subsidy feasibility in accordance with the DPDP Act 2023.',
    submitAndScanBtn: 'Submit & Run AI Bill Reading',
    billVerifyHeading: 'AI Electricity Bill Verification & Solar Recommendation',
    originalBillTitle: 'Original Uploaded Electricity Bill',
    extractedBillTitle: 'Extracted Utility Bill Information',
    unclearBillTitle: 'Blurry or Unreadable Electricity Bill — Re-upload Requested',
    unclearBillDesc:
      'Gemini Vision could not reliably read key utility fields. Please upload a clearer photo or explicitly attest manual verification below before confirming.',
    confirmBillBtn: 'Confirm Extracted Bill Data',
    verifyLockBtn: 'Verify & Lock Bill Data',
    showFullPii: 'Show Protected PII',
    maskPii: 'Mask Protected PII',
    multiOptionTitle: 'Solar System Options Comparison (1 kW · 2 kW · 3 kW · Suitable Alternative)',
    multiOptionSub:
      'Deterministic backend comparison using configured generation, hardware pricing, and effective-dated subsidy rules.',
    validityWindowLabel: 'Quotation Validity Window',
    issueQuotationBtn: 'Issue Official Quotation',
    saveDraftBtn: 'Save Draft',
    approveProposalBtn: 'Approve Quotation',
    declineProposalBtn: 'Request Revision',
    projectLifecycleTitle: '10-Stage Solar Installation & Subsidy Lifecycle',
    adminReadOnlyNotice:
      'Read-Only View: Administrative rule creation and archiving are restricted to authorized Administrators.',
    auditHistoryTitle: 'Configuration Version & Audit History',
    pipelineFiltersTitle: 'Pipeline & Regional Filters',
    delayedWatchlistTitle: 'Delayed & Stuck Projects Attention Queue',
  },
  mr: {
    brandTitle: 'सूर्यसेतू (SuryaSetu)',
    navDashboard: 'डॅशबोर्ड',
    navLeads: 'ग्राहक चौकशी',
    navQuotations: 'कोटेशन',
    navProjects: 'प्रकल्प स्थिती',
    navNotifications: 'सूचना',
    navConfig: 'दर आणि अनुदान नियम',
    navEnquiry: 'नवीन सोलर अर्ज',
    navMySolar: 'माझे अर्ज',
    ctaNewEnquiry: 'सोलर चौकशी करा',
    heroHeading: 'विदर्भासाठी रूफटॉप सोलर पात्रता, कोटेशन आणि प्रकल्प व्यवस्थापन',
    heroSubheading:
      'तुमचे वीज बिल अपलोड करा, AI द्वारे युनिट्स तपासा, पारदर्शक सोलर क्षमता आणि अनुदान कोटेशन मिळवा.',
    submitEnquiry: 'सोलर चौकशी सबमिट करा',
    ownerLabel: 'घरमालक (Owner)',
    tenantLabel: 'भाडेकरू (Tenant)',
    billUploadHint: 'तुमच्या महावितरण / वीज बिलाचा स्पष्ट फोटो अपलोड करा (कमाल 5 MB).',
    switchToSales: 'सेल्स स्टाफ कन्सोल',
    switchToHomeowner: 'ग्राहक पोर्टल पहा',
    signOut: 'बाहेर पडा',
    roleAdmin: 'प्रशासक (Admin)',
    roleSales: 'सेल्स प्रतिनिधी',
    roleHomeowner: 'ग्राहक (Homeowner)',
    homeownerPortalLabel: 'ग्राहक पोर्टल',
    themeLightLabel: 'उजळ',
    themeDarkLabel: 'गडद',
    leadFormHeading: 'रूफटॉप सोलर प्रकल्पासाठी नवीन चौकशी नोंदवा',
    leadFormSubheading:
      'तुमच्या मालमत्तेचा तपशील भरा आणि महावितरण वीज बिलाचा स्पष्ट फोटो जोडा.',
    customerNameLabel: 'ग्राहकाचे पूर्ण नाव *',
    mobileLabel: '१० अंकी मोबाईल क्रमांक *',
    emailOptionalLabel: 'ईमेल पत्ता (पर्यायी)',
    pincodeLabel: 'पिनकोड *',
    ownershipStatusLabel: 'मालकी स्थिती *',
    roofTypeLabel: 'छताचा प्रकार (Roof Type) *',
    roofAreaLabel: 'सावलीमुक्त उपलब्ध छत क्षेत्रफळ (चौ. फूट) *',
    monthlyBillLabel: 'सरासरी मासिक वीज बिल (₹) *',
    dpdpConsentLabel:
      'सोलर क्षमता मोजणी, कोटेशन आणि महावितरण अनुदान प्रक्रियेसाठी माझा संपर्क तपशील व वीज बिल वापरण्यास DPDP कायदा २०२३ अंतर्गत माझी संमती आहे.',
    submitAndScanBtn: 'सबमिट करा आणि AI बिल तपासणी करा',
    billVerifyHeading: 'AI वीज बिल पडताळणी आणि सोलर क्षमता शिफारस',
    originalBillTitle: 'अपलोड केलेले मूळ वीज बिल',
    extractedBillTitle: 'बिलामधून वाचलेला तपशील (तपासा व दुरुस्त करा)',
    unclearBillTitle: 'अस्पष्ट वीज बिल फोटो — कृपया पुन्हा अपलोड करा',
    unclearBillDesc:
      'वीज बिलावरील माहिती स्पष्ट वाचता आली नाही. कृपया स्पष्ट फोटो अपलोड करा किंवा सर्व रकाने स्वतः तपासून निश्चित करा.',
    confirmBillBtn: 'बिल माहिती निश्चित करा',
    verifyLockBtn: 'तपशील तपासा आणि लॉक करा',
    showFullPii: 'पूर्ण ग्राहक क्रमांक पहा',
    maskPii: 'ग्राहक क्रमांक लपवा',
    multiOptionTitle: 'सोलर क्षमता पर्याय तुलना (1 kW · 2 kW · 3 kW · योग्य पर्याय)',
    multiOptionSub: 'नियमांनुसार वार्षिक वीज निर्मिती, एकूण खर्च, अनुदान आणि परतावा कालावधी.',
    validityWindowLabel: 'कोटेशन वैधता कालावधी',
    issueQuotationBtn: 'अधिकृत कोटेशन जारी करा',
    saveDraftBtn: 'मसुदा जतन करा',
    approveProposalBtn: 'कोटेशन मंजूर करा',
    declineProposalBtn: 'बदल विनंती करा',
    projectLifecycleTitle: '१०-टप्पे सोलर बसवणे आणि अनुदान ट्रॅकिंग',
    adminReadOnlyNotice:
      'फक्त पाहण्यासाठी (Read-Only): दर आणि अनुदान नियम बदलण्याचा अधिकार फक्त अधिकृत प्रशासकांना आहे.',
    auditHistoryTitle: 'नियम बदल आणि ऑडिट इतिहास',
    pipelineFiltersTitle: 'विदर्भ विभाग आणि पाइपलाइन फिल्टर',
    delayedWatchlistTitle: 'प्रलंबित / विलंबित प्रकल्प यादी',
  },
  hi: {
    brandTitle: 'सूर्यसेतु (SuryaSetu)',
    navDashboard: 'डैशबोर्ड',
    navLeads: 'ग्राहक लीड्स',
    navQuotations: 'कोटेशन',
    navProjects: 'प्रोजेक्ट ट्रैकिंग',
    navNotifications: 'सूचनाएं',
    navConfig: 'मूल्य व सब्सिडी नियम',
    navEnquiry: 'नया सोलर आवेदन',
    navMySolar: 'मेरे आवेदन',
    ctaNewEnquiry: 'सोलर पूछताछ करें',
    heroHeading: 'विदर्भ के लिए रूफटॉप सोलर पात्रता, कोटेशन एवं प्रोजेक्ट प्रबंधन',
    heroSubheading:
      'अपना बिजली बिल अपलोड करें, AI से खपत जांचें, पारदर्शी सोलर क्षमता सुझाव और सब्सिडी कोटेशन प्राप्त करें।',
    submitEnquiry: 'सोलर पूछताछ जमा करें',
    ownerLabel: 'मकान मालिक (Owner)',
    tenantLabel: 'किरायेदार (Tenant)',
    billUploadHint: 'अपने बिजली बिल की स्पष्ट JPEG, PNG या WebP फोटो अपलोड करें (अधिकतम 5 MB)।',
    switchToSales: 'सेल्स स्टाफ कंसोल',
    switchToHomeowner: 'ग्राहक पोर्टल देखें',
    signOut: 'लॉग आउट',
    roleAdmin: 'प्रशासक (Admin)',
    roleSales: 'सेल्स स्टाफ',
    roleHomeowner: 'ग्राहक (Homeowner)',
    homeownerPortalLabel: 'ग्राहक पोर्टल',
    themeLightLabel: 'लाइट',
    themeDarkLabel: 'डार्क',
    leadFormHeading: 'रूफटॉप सोलर इंस्टॉलेशन पूछताछ दर्ज करें',
    leadFormSubheading:
      'नीचे अपनी संपत्ति का विवरण भरें और त्वरित AI रीडिंग के लिए अपने बिजली बिल की स्पष्ट फोटो अपलोड करें।',
    customerNameLabel: 'ग्राहक का पूरा नाम *',
    mobileLabel: '10-अंकीय मोबाइल नंबर *',
    emailOptionalLabel: 'ईमेल पता (वैकल्पिक)',
    pincodeLabel: 'इंस्टॉलेशन पिनकोड *',
    ownershipStatusLabel: 'संपत्ति स्वामित्व स्थिति *',
    roofTypeLabel: 'छत का प्रकार (Roof Type) *',
    roofAreaLabel: 'छाया-मुक्त उपलब्ध छत क्षेत्र (वर्ग फुट) *',
    monthlyBillLabel: 'औसत मासिक बिजली बिल (₹) *',
    dpdpConsentLabel:
      'मैं DPDP अधिनियम 2023 के तहत रूफटॉप सोलर साइजिंग, कोटेशन और डिस्कॉम सब्सिडी प्रक्रिया के लिए अपने संपर्क विवरण और बिजली बिल के उपयोग की सहमति देता/देती हूँ।',
    submitAndScanBtn: 'जमा करें और AI बिल जांच चलाएं',
    billVerifyHeading: 'AI बिजली बिल सत्यापन एवं सोलर क्षमता सुझाव',
    originalBillTitle: 'अपलोड किया गया मूल बिजली बिल',
    extractedBillTitle: 'बिल से निकाला गया विवरण (जांचें और सुधारें)',
    unclearBillTitle: 'धुंधला या अपठनीय बिजली बिल — पुनः अपलोड आवश्यक',
    unclearBillDesc:
      'बिल की जानकारी स्पष्ट रूप से पढ़ी नहीं जा सकी। कृपया साफ फोटो अपलोड करें या नीचे मैन्युअल सत्यापन की पुष्टि करें।',
    confirmBillBtn: 'बिल विवरण की पुष्टि करें',
    verifyLockBtn: 'सत्यापित करें और लॉक करें',
    showFullPii: 'पूर्ण उपभोक्ता नंबर दिखाएं',
    maskPii: 'उपभोक्ता नंबर छिपाएं',
    multiOptionTitle: 'सोलर सिस्टम विकल्प तुलना (1 kW · 2 kW · 3 kW · उपयुक्त विकल्प)',
    multiOptionSub: 'निर्धारित नियमों के अनुसार वार्षिक उत्पादन, कुल लागत, सब्सिडी और पेबैक अवधि।',
    validityWindowLabel: 'कोटेशन वैधता अवधि',
    issueQuotationBtn: 'आधिकारिक कोटेशन जारी करें',
    saveDraftBtn: 'ड्राफ्ट सहेजें',
    approveProposalBtn: 'कोटेशन स्वीकृत करें',
    declineProposalBtn: 'संशोधन का अनुरोध करें',
    projectLifecycleTitle: '10-चरणीय सोलर इंस्टॉलेशन एवं सब्सिडी ट्रैकिंग',
    adminReadOnlyNotice:
      'केवल पठन (Read-Only): मूल्य और सब्सिडी नियमों को संशोधित करने का अधिकार केवल अधिकृत प्रशासकों को है।',
    auditHistoryTitle: 'नियम संस्करण एवं ऑडिट इतिहास',
    pipelineFiltersTitle: 'विदर्भ क्षेत्र एवं पाइपलाइन फ़िल्टर',
    delayedWatchlistTitle: 'विलंबित / रुके हुए प्रोजेक्ट्स सूची',
  },
};

export function t(lang: SupportedLanguage): TranslationDictionary {
  return TRANSLATIONS[lang] ?? TRANSLATIONS.en;
}
