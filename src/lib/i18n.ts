import type { SupportedLanguage } from '../types/domain.ts';

interface TranslationDictionary {
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
  },
};

export function t(lang: SupportedLanguage): TranslationDictionary {
  return TRANSLATIONS[lang] ?? TRANSLATIONS.en;
}
