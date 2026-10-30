"use client";

import { LegalShell } from "../lib/LegalShell";
import { useLang } from "../lib/i18n";

export default function TermsPage() {
  const { lang } = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  return (
    <LegalShell title={L("Terms & Conditions", "விதிமுறைகள் & நிபந்தனைகள்")} updated={L("Last updated: 23 October 2026", "கடைசியாகப் புதுப்பிக்கப்பட்டது: 23 அக்டோபர் 2026")}>
      <p>{L("These terms are an agreement between you and Coconut Trade Desk (\"we\", \"us\", \"the app\"). By creating an account or using the app, you agree to these terms and to our Privacy Policy.", "இந்த விதிமுறைகள் உங்களுக்கும் Coconut Trade Desk (\"நாங்கள்\", \"ஆப்\") க்கும் இடையிலான ஒப்பந்தம். கணக்கை உருவாக்குவதன் மூலம் அல்லது ஆப்பைப் பயன்படுத்துவதன் மூலம், இந்த விதிமுறைகளுக்கும் எங்கள் தனியுரிமைக் கொள்கைக்கும் நீங்கள் ஒப்புக்கொள்கிறீர்கள்.")}</p>

      <h2>{L("1. The service", "1. சேவை")}</h2>
      <p>{L("Coconut Trade Desk is a record-keeping tool that helps coconut traders track purchases, stock, sales, husk, expenses, cash and profit. It is a bookkeeping aid, not accounting, tax, or legal advice.", "Coconut Trade Desk என்பது தேங்காய் வியாபாரிகள் கொள்முதல், கையிருப்பு, விற்பனை, மட்டை, செலவு, பணம், லாபத்தைக் கண்காணிக்க உதவும் பதிவு கருவி. இது ஒரு கணக்குப் பதிவு உதவி; கணக்கியல், வரி அல்லது சட்ட ஆலோசனை அல்ல.")}</p>

      <h2>{L("2. Eligibility", "2. தகுதி")}</h2>
      <p>{L("You must be at least 18 years old and able to enter a contract, and you must use the app only for lawful business purposes.", "நீங்கள் குறைந்தது 18 வயது நிரம்பியவராகவும், ஒப்பந்தம் செய்யத் தகுதியுடையவராகவும் இருக்க வேண்டும்; ஆப்பை சட்டப்பூர்வ வணிக நோக்கங்களுக்கு மட்டுமே பயன்படுத்த வேண்டும்.")}</p>

      <h2>{L("3. Your account", "3. உங்கள் கணக்கு")}</h2>
      <p>{L("Keep your login details safe and give accurate information. You are responsible for what happens under your account. One mobile number is linked to one account.", "உங்கள் உள்நுழைவு விவரங்களைப் பாதுகாப்பாக வைத்து, சரியான தகவலைக் கொடுக்கவும். உங்கள் கணக்கின் கீழ் நடப்பவற்றுக்கு நீங்களே பொறுப்பு. ஒரு கைபேசி எண் ஒரு கணக்குடன் இணைக்கப்படும்.")}</p>

      <h2>{L("4. Subscription and billing", "4. சந்தா மற்றும் கட்டணம்")}</h2>
      <ul>
        <li>{L("New traders get a 9-day free trial.", "புதிய வியாபாரிகளுக்கு 9 நாள் இலவச சோதனை.")}</li>
        <li>{L("After the trial, the app costs ₹519 per month, charged through Razorpay.", "சோதனைக்குப் பிறகு, ஆப் மாதம் ₹519; Razorpay மூலம் வசூலிக்கப்படும்.")}</li>
        <li>{L("The subscription renews each month until you cancel. You can cancel anytime; access continues until the end of the paid period.", "நீங்கள் ரத்து செய்யும் வரை சந்தா ஒவ்வொரு மாதமும் புதுப்பிக்கப்படும். எப்போது வேண்டுமானாலும் ரத்து செய்யலாம்; கட்டணக் காலம் முடியும் வரை அணுகல் தொடரும்.")}</li>
        <li>{L("Fees already paid are generally non-refundable except where the law requires otherwise.", "ஏற்கனவே செலுத்திய கட்டணங்கள் பொதுவாகத் திரும்பப் பெறப்படாது; சட்டம் வேறுவிதமாகக் கோரும் இடங்களைத் தவிர.")}</li>
      </ul>

      <h2>{L("5. Acceptable use", "5. ஏற்கத்தக்க பயன்பாடு")}</h2>
      <p>{L("Do not misuse the app: no unlawful activity, no attempt to break security, no uploading of others' personal data without a fair and lawful reason, and no use that harms the service or other users.", "ஆப்பைத் தவறாகப் பயன்படுத்த வேண்டாம்: சட்டவிரோத செயல்கள் வேண்டாம், பாதுகாப்பை உடைக்க முயற்சி வேண்டாம், நியாயமான சட்டப்பூர்வ காரணம் இல்லாமல் பிறரின் தனிப்பட்ட தரவைப் பதிவேற்ற வேண்டாம், சேவைக்கோ பிற பயனர்களுக்கோ தீங்கு விளைவிக்கும் பயன்பாடு வேண்டாம்.")}</p>

      <h2>{L("6. Your data and records", "6. உங்கள் தரவு மற்றும் பதிவுகள்")}</h2>
      <p>{L("Your business records belong to you. You give us permission to store and process them only to provide the app to you. You are responsible for the accuracy of what you enter.", "உங்கள் வணிகப் பதிவுகள் உங்களுக்குச் சொந்தமானவை. ஆப்பை உங்களுக்கு வழங்குவதற்காக மட்டுமே அவற்றைச் சேமித்து செயலாக்க எங்களுக்கு அனுமதி அளிக்கிறீர்கள். நீங்கள் உள்ளிடுவதன் சரியான தன்மைக்கு நீங்களே பொறுப்பு.")}</p>

      <h2>{L("7. No warranty", "7. உத்தரவாதம் இல்லை")}</h2>
      <p>{L("We work hard to keep the app reliable, but it is provided \"as is\". We do not guarantee it will always be available or error-free, and the calculations are tools to help you — please check important figures yourself.", "ஆப்பை நம்பகமானதாக வைக்க நாங்கள் கடினமாக உழைக்கிறோம், ஆனால் அது \"உள்ளபடி\" வழங்கப்படுகிறது. அது எப்போதும் கிடைக்கும் அல்லது பிழையற்றதாக இருக்கும் என உத்தரவாதம் இல்லை; கணக்கீடுகள் உங்களுக்கு உதவும் கருவிகள் — முக்கிய எண்களை நீங்களே சரிபார்க்கவும்.")}</p>

      <h2>{L("8. Limitation of liability", "8. பொறுப்பு வரம்பு")}</h2>
      <p>{L("To the extent allowed by law, we are not liable for indirect or consequential losses, and our total liability is limited to the fees you paid us in the previous three months.", "சட்டம் அனுமதிக்கும் அளவிற்கு, மறைமுக அல்லது விளைவு இழப்புகளுக்கு நாங்கள் பொறுப்பல்ல; எங்கள் மொத்தப் பொறுப்பு, முந்தைய மூன்று மாதங்களில் நீங்கள் செலுத்திய கட்டணத்திற்கு வரம்பிடப்படுகிறது.")}</p>

      <h2>{L("9. Suspension and termination", "9. இடைநீக்கம் மற்றும் முடிவு")}</h2>
      <p>{L("You can stop using the app and delete your account anytime. We may suspend or end access if these terms are broken or payment is not made.", "எப்போது வேண்டுமானாலும் ஆப்பைப் பயன்படுத்துவதை நிறுத்தி கணக்கை நீக்கலாம். இந்த விதிமுறைகள் மீறப்பட்டால் அல்லது கட்டணம் செலுத்தப்படாவிட்டால் அணுகலை நாங்கள் இடைநிறுத்தலாம் அல்லது முடிக்கலாம்.")}</p>

      <h2>{L("10. Changes to these terms", "10. இந்த விதிமுறைகளில் மாற்றங்கள்")}</h2>
      <p>{L("We may update these terms. We will post the new date here and, for important changes, notify you in the app. Continuing to use the app means you accept the updated terms.", "இந்த விதிமுறைகளை நாங்கள் புதுப்பிக்கலாம். புதிய தேதியை இங்கே வெளியிடுவோம்; முக்கிய மாற்றங்களுக்கு ஆப்பில் தெரிவிப்போம். ஆப்பைத் தொடர்ந்து பயன்படுத்துவது புதுப்பிக்கப்பட்ட விதிமுறைகளை ஏற்பதாகும்.")}</p>

      <h2>{L("11. Governing law", "11. நிர்வகிக்கும் சட்டம்")}</h2>
      <p>{L("These terms are governed by the laws of India, and the courts of Tamil Nadu will have jurisdiction over any dispute.", "இந்த விதிமுறைகள் இந்தியச் சட்டங்களால் நிர்வகிக்கப்படுகின்றன; எந்த சர்ச்சையும் தமிழ்நாடு நீதிமன்றங்களின் அதிகார வரம்பிற்கு உட்பட்டது.")}</p>

      <h2>{L("12. Contact", "12. தொடர்பு")}</h2>
      <p>{L("Questions about these terms? Email", "இந்த விதிமுறைகள் பற்றிய கேள்விகள்? மின்னஞ்சல்")} <a href="mailto:support@coconuttradedesk.com">support@coconuttradedesk.com</a>.</p>
    </LegalShell>
  );
}
