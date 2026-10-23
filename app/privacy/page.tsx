"use client";

import { LegalShell } from "../lib/LegalShell";
import { useLang } from "../lib/i18n";

export default function PrivacyPage() {
  const { lang } = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  return (
    <LegalShell title={L("Privacy Policy", "தனியுரிமைக் கொள்கை")} updated={L("Last updated: 23 October 2026", "கடைசியாகப் புதுப்பிக்கப்பட்டது: 23 அக்டோபர் 2026")}>
      <p>{L("Coconut Trade Desk (\"we\", \"us\", \"the app\") helps coconut traders record their purchases, stock, sales, husk, expenses and cash. This policy explains what information we collect, how we use it, and your rights. We follow India's Digital Personal Data Protection Act, 2023.", "Coconut Trade Desk (\"நாங்கள்\", \"ஆப்\") தேங்காய் வியாபாரிகள் தங்கள் கொள்முதல், கையிருப்பு, விற்பனை, மட்டை, செலவு, பணத்தைப் பதிவு செய்ய உதவுகிறது. நாங்கள் எந்தத் தகவலைச் சேகரிக்கிறோம், அதை எப்படிப் பயன்படுத்துகிறோம், உங்கள் உரிமைகள் என்ன என்பதை இந்தக் கொள்கை விளக்குகிறது. நாங்கள் இந்தியாவின் டிஜிட்டல் தனிநபர் தரவுப் பாதுகாப்புச் சட்டம், 2023-ஐப் பின்பற்றுகிறோம்.")}</p>

      <h2>{L("1. Information we collect", "1. நாங்கள் சேகரிக்கும் தகவல்")}</h2>
      <ul>
        <li><strong>{L("Account details", "கணக்கு விவரங்கள்")}:</strong> {L("your name, mobile number, email, business/farm name, and whether you are a trader or farmer.", "உங்கள் பெயர், கைபேசி எண், மின்னஞ்சல், வணிக/பண்ணை பெயர், மற்றும் நீங்கள் வியாபாரியா விவசாயியா என்பது.")}</li>
        <li><strong>{L("Business records you enter", "நீங்கள் உள்ளிடும் வணிகப் பதிவுகள்")}:</strong> {L("the farmers you add (name and phone), purchases, stock, sales, husk, expenses, cash entries and prices.", "நீங்கள் சேர்க்கும் விவசாயிகள் (பெயர், தொலைபேசி), கொள்முதல், கையிருப்பு, விற்பனை, மட்டை, செலவுகள், பண பதிவுகள், விலைகள்.")}</li>
        <li><strong>{L("Payment information", "கட்டண தகவல்")}:</strong> {L("subscription status processed by our payment partner Razorpay. We do not store your card or bank details.", "எங்கள் கட்டண பங்குதாரர் Razorpay மூலம் செயலாக்கப்படும் சந்தா நிலை. உங்கள் கார்டு/வங்கி விவரங்களை நாங்கள் சேமிப்பதில்லை.")}</li>
        <li><strong>{L("Usage data", "பயன்பாட்டுத் தரவு")}:</strong> {L("basic, privacy-friendly analytics about how the app is used, to improve it.", "ஆப்பை மேம்படுத்த, அது எப்படிப் பயன்படுத்தப்படுகிறது பற்றிய அடிப்படை, தனியுரிமை மதிக்கும் பகுப்பாய்வு.")}</li>
      </ul>

      <h2>{L("2. How we use your information", "2. உங்கள் தகவலை எப்படிப் பயன்படுத்துகிறோம்")}</h2>
      <ul>
        <li>{L("To provide the app and keep your records safe and available to you.", "ஆப்பை வழங்கவும், உங்கள் பதிவுகளைப் பாதுகாப்பாக உங்களுக்குக் கிடைக்கச் செய்யவும்.")}</li>
        <li>{L("To run your subscription and send receipts and renewal reminders.", "உங்கள் சந்தாவை நடத்தவும், ரசீதுகள் மற்றும் புதுப்பித்தல் நினைவூட்டல்களை அனுப்பவும்.")}</li>
        <li>{L("To provide support and keep the service secure.", "ஆதரவு வழங்கவும், சேவையைப் பாதுகாப்பாக வைக்கவும்.")}</li>
        <li>{L("To send product updates, tips and offers — only if you opted in to marketing (you can opt out anytime).", "தயாரிப்பு புதுப்பிப்புகள், குறிப்புகள், சலுகைகளை அனுப்ப — நீங்கள் சந்தா ஒப்புதல் அளித்திருந்தால் மட்டுமே (எப்போது வேண்டுமானாலும் விலகலாம்).")}</li>
      </ul>

      <h2>{L("3. Legal basis and consent", "3. சட்ட அடிப்படை மற்றும் சம்மதம்")}</h2>
      <p>{L("We process your account and business data to provide the service you signed up for. Marketing messages are sent only with your separate, optional consent, which you can withdraw at any time.", "நீங்கள் பதிவு செய்த சேவையை வழங்க உங்கள் கணக்கு மற்றும் வணிகத் தரவை நாங்கள் செயலாக்குகிறோம். சந்தைப்படுத்தல் செய்திகள் உங்கள் தனி, விருப்ப சம்மதத்துடன் மட்டுமே அனுப்பப்படும்; அதை எப்போது வேண்டுமானாலும் திரும்பப் பெறலாம்.")}</p>

      <h2>{L("4. Who we share data with", "4. யாருடன் தரவைப் பகிர்கிறோம்")}</h2>
      <p>{L("We do not sell your data. We share it only with trusted service providers that help us run the app, under their own security obligations:", "உங்கள் தரவை நாங்கள் விற்பதில்லை. ஆப்பை இயக்க உதவும் நம்பகமான சேவை வழங்குநர்களுடன் மட்டுமே, அவர்களின் பாதுகாப்பு கடமைகளின் கீழ் பகிர்கிறோம்:")}</p>
      <ul>
        <li><strong>Supabase</strong> — {L("secure database and sign-in hosting.", "பாதுகாப்பான தரவுத்தளம் மற்றும் உள்நுழைவு.")}</li>
        <li><strong>Google</strong> — {L("optional Google sign-in.", "விருப்ப Google உள்நுழைவு.")}</li>
        <li><strong>Razorpay</strong> — {L("subscription payments.", "சந்தா கட்டணங்கள்.")}</li>
        <li>{L("Privacy-friendly analytics to understand and improve usage.", "பயன்பாட்டைப் புரிந்து மேம்படுத்த தனியுரிமை மதிக்கும் பகுப்பாய்வு.")}</li>
      </ul>

      <h2>{L("5. Security and isolation", "5. பாதுகாப்பு மற்றும் தனிமை")}</h2>
      <p>{L("Each trader's records are isolated at the database level — no other trader can read your farmers, prices or profit. Data is encrypted in transit. No system is perfect, but we work to keep your data safe.", "ஒவ்வொரு வியாபாரியின் பதிவுகளும் தரவுத்தள அளவில் தனிமைப்படுத்தப்பட்டுள்ளன — வேறு எந்த வியாபாரியும் உங்கள் விவசாயிகள், விலைகள் அல்லது லாபத்தைப் படிக்க முடியாது. தரவு பரிமாற்றத்தில் குறியாக்கம் செய்யப்படுகிறது. எந்த அமைப்பும் முழுமையானது அல்ல, ஆனால் உங்கள் தரவைப் பாதுகாப்பாக வைக்க நாங்கள் முயல்கிறோம்.")}</p>

      <h2>{L("6. Farmer information", "6. விவசாயித் தகவல்")}</h2>
      <p>{L("Traders add farmer contacts (name and phone) to keep their own purchase records. In a future release, farmers will be able to sign in with their phone number and view the records a trader entered about them — only after the farmer's consent. We ask traders to add farmer details fairly and lawfully.", "வியாபாரிகள் தங்கள் கொள்முதல் பதிவுகளை வைக்க விவசாயித் தொடர்புகளை (பெயர், தொலைபேசி) சேர்க்கிறார்கள். எதிர்கால வெளியீட்டில், விவசாயிகள் தங்கள் தொலைபேசி எண் மூலம் உள்நுழைந்து, வியாபாரி பதிவு செய்த பதிவுகளைப் பார்க்கலாம் — விவசாயியின் சம்மதத்திற்குப் பிறகு மட்டுமே. விவசாயி விவரங்களை நியாயமாகவும் சட்டப்பூர்வமாகவும் சேர்க்குமாறு வியாபாரிகளைக் கேட்டுக்கொள்கிறோம்.")}</p>

      <h2>{L("7. Your rights", "7. உங்கள் உரிமைகள்")}</h2>
      <p>{L("You can access and correct your information in the app, withdraw marketing consent, and request deletion of your account and data. To exercise these rights or raise a grievance, contact us at the address below.", "ஆப்பில் உங்கள் தகவலை அணுகலாம், திருத்தலாம், சந்தைப்படுத்தல் சம்மதத்தை விலக்கலாம், உங்கள் கணக்கு மற்றும் தரவை நீக்கக் கோரலாம். இந்த உரிமைகளைப் பயன்படுத்த அல்லது குறை தெரிவிக்க, கீழே உள்ள முகவரியில் தொடர்பு கொள்ளவும்.")}</p>

      <h2>{L("8. Data retention", "8. தரவு வைத்திருத்தல்")}</h2>
      <p>{L("We keep your records while your account is active. If you delete your account, we remove your personal data within a reasonable period, except where we must keep some records for legal or accounting reasons.", "உங்கள் கணக்கு செயலில் இருக்கும் வரை உங்கள் பதிவுகளை வைத்திருக்கிறோம். நீங்கள் கணக்கை நீக்கினால், சட்ட/கணக்கியல் காரணங்களுக்காக சில பதிவுகளை வைத்திருக்க வேண்டிய இடங்களைத் தவிர, உங்கள் தனிப்பட்ட தரவை நியாயமான காலத்திற்குள் அகற்றுகிறோம்.")}</p>

      <h2>{L("9. Cookies and local storage", "9. குக்கீகள் மற்றும் லோக்கல் சேமிப்பு")}</h2>
      <p>{L("We use your browser's local storage to keep you signed in, remember your language, and save drafts. These are needed for the app to work.", "நீங்கள் உள்நுழைந்திருக்க, உங்கள் மொழியை நினைவில் வைக்க, வரைவுகளைச் சேமிக்க உங்கள் உலாவியின் லோக்கல் சேமிப்பைப் பயன்படுத்துகிறோம். ஆப் வேலை செய்ய இவை தேவை.")}</p>

      <h2>{L("10. Children", "10. குழந்தைகள்")}</h2>
      <p>{L("The app is meant for adults running a coconut trading business and is not directed at children under 18.", "ஆப் தேங்காய் வியாபாரம் நடத்தும் பெரியவர்களுக்கானது; 18 வயதுக்குட்பட்ட குழந்தைகளுக்கானது அல்ல.")}</p>

      <h2>{L("11. Changes", "11. மாற்றங்கள்")}</h2>
      <p>{L("We may update this policy. We will post the new date here and, for important changes, let you know in the app.", "இந்தக் கொள்கையை நாங்கள் புதுப்பிக்கலாம். புதிய தேதியை இங்கே வெளியிடுவோம்; முக்கிய மாற்றங்களுக்கு ஆப்பில் தெரிவிப்போம்.")}</p>

      <h2>{L("12. Contact", "12. தொடர்பு")}</h2>
      <p>{L("For any privacy question or request, email", "எந்த தனியுரிமைக் கேள்விக்கும் அல்லது கோரிக்கைக்கும், மின்னஞ்சல்")} <a href="mailto:support@coconuttradedesk.com">support@coconuttradedesk.com</a>.</p>
    </LegalShell>
  );
}
