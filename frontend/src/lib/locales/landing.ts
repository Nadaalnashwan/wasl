/* Messages for the landing area. Owned by that area's pages; keys must be prefixed "landing2." to avoid collisions. */
import { defineMessages } from "./define";

export default defineMessages(
  {
    /* nav */
    "landing2.nav.label": "Page sections",
    "landing2.nav.how": "How it works",
    "landing2.nav.evidence": "Evidence checks",
    "landing2.nav.features": "Features",
    "landing2.nav.privacy": "Privacy",
    "landing2.cta": "Create account",

    /* hero */
    "landing2.hero.eyebrow": "Evidence-grounded career workspace",
    "landing2.hero.t1": "Document an achievement once.",
    "landing2.hero.t2": "Use it everywhere.",
    "landing2.hero.sub":
      "Wasl turns your projects, documents and repositories into structured achievements, then helps you keep a verified Master CV, draft LinkedIn posts, tailor your CV to jobs and plan the skills you still need. Every AI draft is checked against your own evidence.",
    "landing2.hero.cta": "Create your account",
    "landing2.hero.secondary": "See how it works",
    "landing2.hero.note": "Use Wasl's AI or bring your own key · English and Arabic",

    /* product preview (sample content) */
    "landing2.preview.label": "Illustrative interface preview",
    "landing2.preview.caption": "Illustrative interface preview with sample content. It does not show a real person's data.",
    "landing2.preview.sample": "Sample",
    "landing2.preview.s1": "Achievement",
    "landing2.preview.s2": "Evidence check",
    "landing2.preview.s3": "Master CV suggestion",
    "landing2.preview.ach.title": "Built a Flask registration system",
    "landing2.preview.ach.desc":
      "Built a member registration system for a student club with Flask and PostgreSQL, including email confirmation and an admin view.",
    "landing2.preview.ach.sources": "Evidence",
    "landing2.preview.ach.src1": "Project notes",
    "landing2.preview.ach.src2": "GitHub repository",
    "landing2.preview.ach.skills": "Skills found in evidence",
    "landing2.preview.ach.contrib": "Contribution confirmed by you",
    "landing2.preview.draft.label": "AI draft",
    "landing2.preview.draft.text": "Led the development of a Flask and PostgreSQL registration system that made sign-ups 40% faster.",
    "landing2.preview.claim.flask.text": "Built with Flask",
    "landing2.preview.claim.flask.quote": "README: A Flask app for club member registration.",
    "landing2.preview.claim.pg.text": "Uses PostgreSQL",
    "landing2.preview.claim.pg.quote": "config.py: SQLALCHEMY_DATABASE_URI = postgresql://…",
    "landing2.preview.claim.speed.text": "Sign-ups became 40% faster",
    "landing2.preview.claim.speed.value": "40% faster sign-ups",
    "landing2.preview.claim.led.text": "Led the development",
    "landing2.preview.claim.led.value": "Led the development",
    "landing2.preview.sug.section": "Projects · Club registration system",
    "landing2.preview.sug.bullet": "Built a Flask and PostgreSQL registration system with email confirmation and an admin view.",
    "landing2.preview.sug.removed": "Left out: “40% faster sign-ups” is not in your evidence.",
    "landing2.preview.sug.changed": "“Led” became “Built” until you confirm your role.",
    "landing2.preview.sug.draft": "Draft · waiting for your review",
    "landing2.preview.sug.note": "Your Master CV changes only if you accept.",

    /* workflow */
    "landing2.how.eyebrow": "How it works",
    "landing2.how.title": "From one achievement to every career document",
    "landing2.how.sub": "Wasl keeps one verified record of what you have done, and reuses it wherever you need it.",
    "landing2.how.s1.t": "Document it",
    "landing2.how.s1.d":
      "Write it in your own words, upload a certificate or project document, or scan a GitHub repository. Wasl extracts candidate achievements and quotes the source for each one.",
    "landing2.how.s1.m": "Manual entry · Documents · GitHub",
    "landing2.how.s2.t": "Check it",
    "landing2.how.s2.d":
      "Evidence quotes must appear in your source, and skills that are not in it are dropped. For repositories, you confirm your personal contribution — authorship is never assumed.",
    "landing2.how.s2.m": "Quotes · Skills · Your contribution",
    "landing2.how.s3.t": "Approve it",
    "landing2.how.s3.d":
      "Confirmed achievements become suggested Master CV updates. You accept, edit or reject each one, and every accepted change is saved as a new version.",
    "landing2.how.s3.m": "Accept · Edit · Reject",
    "landing2.how.s4.t": "Reuse it",
    "landing2.how.s4.d":
      "Draft LinkedIn posts, tailor your CV to a job and see which skills you are missing — all from the same verified record.",
    "landing2.how.s4.m": "Posts · Tailored CVs · Skill gaps",

    /* evidence */
    "landing2.ev.eyebrow": "Evidence-grounded AI",
    "landing2.ev.title": "AI drafts are checked against your evidence",
    "landing2.ev.sub":
      "Language models can overstate what you did. Wasl compares the numbers, skills, credentials and roles in each draft with what you actually provided, and shows you the result before you use it.",
    "landing2.ev.statuses": "What each result means",
    "landing2.ev.supported": "Matches a quote from your evidence. It is shown with that quote.",
    "landing2.ev.needs_confirmation": "Depends on something only you can confirm, such as your role on a team project.",
    "landing2.ev.unsupported": "Not found in your evidence. It is flagged in posts, and left out of tailored CVs in favour of your original wording.",
    "landing2.ev.contradicted": "Conflicts with your evidence. It is flagged so you can correct it.",
    "landing2.ev.p1.t": "Drafts, not decisions",
    "landing2.ev.p1.d": "AI output is labelled as a draft until you review it.",
    "landing2.ev.p2.t": "You approve every Master CV change",
    "landing2.ev.p2.d": "Suggestions wait for your Accept, Edit or Reject. Earlier versions can be restored.",
    "landing2.ev.p3.t": "Honest about limits",
    "landing2.ev.p3.d": "The check is automated and can miss cases, so review the text before you publish or send it.",

    /* features */
    "landing2.f.eyebrow": "Features",
    "landing2.f.title": "Everything grows from one record",
    "landing2.f.studio.t": "LinkedIn Post Studio",
    "landing2.f.studio.d":
      "Turn a confirmed achievement into a post in Arabic or English, in the tone that fits. Claims are checked before you publish, and nothing is posted without your explicit confirmation.",
    "landing2.f.studio.tones": "Available tones",
    "landing2.f.cv.t": "Living Master CV",
    "landing2.f.cv.d": "Versioned and duplicate-aware. Restore any earlier version and export to PDF or Word.",
    "landing2.f.jobs.t": "Job discovery and matching",
    "landing2.f.jobs.d": "Browse openings suggested from your CV, save the ones you like and see which requirements your evidence covers.",
    "landing2.f.tailor.t": "Honest tailoring",
    "landing2.f.tailor.d": "Reorders and rephrases what you already have for a specific job. Bullets that fail the evidence check are dropped.",
    "landing2.f.gap.t": "Skill gaps and roadmap",
    "landing2.f.gap.d": "Separates skills you are missing from skills you have but cannot prove yet, then outlines a learning roadmap.",
    "landing2.f.lang.t": "Arabic and English",
    "landing2.f.lang.d": "Write, read and generate in either language, with full right-to-left support.",

    /* privacy */
    "landing2.pv.eyebrow": "Privacy and control",
    "landing2.pv.title": "Your data, your decisions",
    "landing2.pv.sub": "Wasl limits what AI providers see, and you decide what ends up on your CV.",
    "landing2.pv.pii.t": "Personal details are redacted",
    "landing2.pv.pii.d":
      "Before any text is sent to an AI provider, your name, email, phone number, ID and passport numbers, bank and card numbers, profile links, addresses and API keys are replaced with placeholders. Wasl restores them locally in the result.",
    "landing2.pv.providers.t": "Privacy-checked providers",
    "landing2.pv.providers.d":
      "AI tasks that involve your career data only go to providers that meet Wasl's minimum privacy level. If none is available, nothing is sent.",
    "landing2.pv.byok.t": "Bring your own key",
    "landing2.pv.byok.d":
      "Use Wasl's AI or connect your own provider key. Keys are validated with the provider, encrypted at rest and never shown again in full.",
    "landing2.pv.guard.t": "Uploaded text is treated as data",
    "landing2.pv.guard.d":
      "Documents and repository files are screened for instructions aimed at the AI and passed to the model as data, not as commands.",
    "landing2.pv.approve.t": "Nothing changes without you",
    "landing2.pv.approve.d": "AI suggestions never edit your Master CV or publish to LinkedIn on their own.",
    "landing2.pv.data.t": "Export or delete",
    "landing2.pv.data.d": "Export your CV as PDF or Word at any time. Deleting your account removes the data stored with it.",

    /* closing */
    "landing2.end.title": "Start with one achievement.",
    "landing2.end.sub": "Document it once. Wasl helps you reuse it accurately everywhere else.",
    "landing2.end.signin": "Already have an account? Sign in",

    /* footer */
    "landing2.foot.product": "Product",
    "landing2.foot.account": "Account",
    "landing2.foot.rights": "© 2026 Wasl",
  },
  {
    /* nav */
    "landing2.nav.label": "أقسام الصفحة",
    "landing2.nav.how": "كيف يعمل",
    "landing2.nav.evidence": "التحقق بالأدلة",
    "landing2.nav.features": "المزايا",
    "landing2.nav.privacy": "الخصوصية",
    "landing2.cta": "إنشاء حساب",

    /* hero */
    "landing2.hero.eyebrow": "مساحة مهنية مبنية على الأدلة",
    "landing2.hero.t1": "وثّق إنجازك مرة واحدة.",
    "landing2.hero.t2": "واستخدمه في كل مكان.",
    "landing2.hero.sub":
      "يحوّل وصل مشاريعك ومستنداتك ومستودعاتك البرمجية إلى إنجازات منظمة، ثم يساعدك على الحفاظ على سيرة ذاتية رئيسية موثّقة، وكتابة منشورات LinkedIn، وتخصيص سيرتك للوظائف، والتخطيط للمهارات التي تحتاجها. وتُقارن كل مسودة يكتبها الذكاء الاصطناعي بأدلتك أنت.",
    "landing2.hero.cta": "أنشئ حسابك",
    "landing2.hero.secondary": "تعرّف على طريقة العمل",
    "landing2.hero.note": "استخدم ذكاء وصل الاصطناعي أو مفتاحك الخاص · العربية والإنجليزية",

    /* product preview (sample content) */
    "landing2.preview.label": "معاينة توضيحية للواجهة",
    "landing2.preview.caption": "معاينة توضيحية للواجهة بمحتوى نموذجي، ولا تعرض بيانات أي شخص حقيقي.",
    "landing2.preview.sample": "نموذج",
    "landing2.preview.s1": "الإنجاز",
    "landing2.preview.s2": "التحقق بالأدلة",
    "landing2.preview.s3": "اقتراح للسيرة الرئيسية",
    "landing2.preview.ach.title": "بناء نظام تسجيل باستخدام Flask",
    "landing2.preview.ach.desc":
      "بنيت نظامًا لتسجيل أعضاء نادٍ طلابي باستخدام Flask وPostgreSQL، يشمل تأكيد البريد الإلكتروني ولوحة للمشرفين.",
    "landing2.preview.ach.sources": "الأدلة",
    "landing2.preview.ach.src1": "ملاحظات المشروع",
    "landing2.preview.ach.src2": "مستودع GitHub",
    "landing2.preview.ach.skills": "مهارات وردت في الأدلة",
    "landing2.preview.ach.contrib": "أكدتَ مساهمتك بنفسك",
    "landing2.preview.draft.label": "مسودة الذكاء الاصطناعي",
    "landing2.preview.draft.text": "قاد تطوير نظام تسجيل باستخدام Flask وPostgreSQL جعل التسجيل أسرع بنسبة 40%.",
    "landing2.preview.claim.flask.text": "مبني باستخدام Flask",
    "landing2.preview.claim.flask.quote": "README: تطبيق Flask لتسجيل أعضاء النادي.",
    "landing2.preview.claim.pg.text": "يستخدم PostgreSQL",
    "landing2.preview.claim.pg.quote": "config.py: SQLALCHEMY_DATABASE_URI = postgresql://…",
    "landing2.preview.claim.speed.text": "أصبح التسجيل أسرع بنسبة 40%",
    "landing2.preview.claim.speed.value": "تسجيل أسرع بنسبة 40%",
    "landing2.preview.claim.led.text": "قاد التطوير",
    "landing2.preview.claim.led.value": "قاد التطوير",
    "landing2.preview.sug.section": "المشاريع · نظام تسجيل النادي",
    "landing2.preview.sug.bullet": "بنيت نظام تسجيل باستخدام Flask وPostgreSQL يشمل تأكيد البريد الإلكتروني ولوحة للمشرفين.",
    "landing2.preview.sug.removed": "لم يُدرج: «تسجيل أسرع بنسبة 40%» غير موجود في أدلتك.",
    "landing2.preview.sug.changed": "استُبدلت «قاد» بـ«بنيت» إلى أن تؤكد دورك.",
    "landing2.preview.sug.draft": "مسودة · بانتظار مراجعتك",
    "landing2.preview.sug.note": "لا تتغير سيرتك الرئيسية إلا إذا وافقت.",

    /* workflow */
    "landing2.how.eyebrow": "كيف يعمل",
    "landing2.how.title": "من إنجاز واحد إلى كل مستنداتك المهنية",
    "landing2.how.sub": "يحتفظ وصل بسجل واحد موثّق لما أنجزته، ويعيد استخدامه أينما احتجت إليه.",
    "landing2.how.s1.t": "وثّقه",
    "landing2.how.s1.d":
      "اكتبه بأسلوبك، أو ارفع شهادة أو مستند مشروع، أو افحص مستودعًا على GitHub. يستخرج وصل الإنجازات المرشحة ويقتبس من المصدر لكل منها.",
    "landing2.how.s1.m": "إدخال يدوي · مستندات · GitHub",
    "landing2.how.s2.t": "تحقّق منه",
    "landing2.how.s2.d":
      "يجب أن تكون الاقتباسات موجودة فعلًا في مصدرك، وتُستبعد المهارات غير المذكورة فيه. وفي المستودعات تؤكد أنت مساهمتك الشخصية، فلا تُفترض الملكية أبدًا.",
    "landing2.how.s2.m": "اقتباسات · مهارات · مساهمتك",
    "landing2.how.s3.t": "وافق عليه",
    "landing2.how.s3.d":
      "تتحول الإنجازات المؤكدة إلى تحديثات مقترحة لسيرتك الرئيسية. تقبل كل اقتراح أو تعدّله أو ترفضه، ويُحفظ كل تغيير مقبول في نسخة جديدة.",
    "landing2.how.s3.m": "قبول · تعديل · رفض",
    "landing2.how.s4.t": "أعد استخدامه",
    "landing2.how.s4.d":
      "اكتب منشورات LinkedIn، وخصّص سيرتك لوظيفة محددة، واعرف المهارات التي تنقصك — كلها من السجل الموثّق نفسه.",
    "landing2.how.s4.m": "منشورات · سير مخصصة · فجوات المهارات",

    /* evidence */
    "landing2.ev.eyebrow": "ذكاء اصطناعي مبني على الأدلة",
    "landing2.ev.title": "تُقارن مسودات الذكاء الاصطناعي بأدلتك",
    "landing2.ev.sub":
      "قد تبالغ النماذج اللغوية في وصف ما أنجزته. لذلك يقارن وصل الأرقام والمهارات والشهادات والأدوار في كل مسودة بما قدّمته فعلًا، ويعرض لك النتيجة قبل أن تستخدمها.",
    "landing2.ev.statuses": "ماذا تعني كل نتيجة",
    "landing2.ev.supported": "يطابق اقتباسًا من أدلتك، ويُعرض معه ذلك الاقتباس.",
    "landing2.ev.needs_confirmation": "يعتمد على أمر لا يؤكده سواك، مثل دورك في مشروع جماعي.",
    "landing2.ev.unsupported": "غير موجود في أدلتك. يُنبَّه عليه في المنشورات، ويُستبعد من السير المخصصة مع الإبقاء على صياغتك الأصلية.",
    "landing2.ev.contradicted": "يتعارض مع أدلتك، ويُنبَّه عليه لتصحّحه.",
    "landing2.ev.p1.t": "مسودات لا قرارات",
    "landing2.ev.p1.d": "تبقى مخرجات الذكاء الاصطناعي موسومة كمسودة حتى تراجعها.",
    "landing2.ev.p2.t": "كل تغيير في سيرتك الرئيسية بموافقتك",
    "landing2.ev.p2.d": "تنتظر الاقتراحات قبولك أو تعديلك أو رفضك، ويمكن استعادة النسخ السابقة.",
    "landing2.ev.p3.t": "صراحة بشأن الحدود",
    "landing2.ev.p3.d": "التحقق آلي وقد يفوّت بعض الحالات، لذا راجع النص قبل نشره أو إرساله.",

    /* features */
    "landing2.f.eyebrow": "المزايا",
    "landing2.f.title": "كل شيء ينطلق من سجل واحد",
    "landing2.f.studio.t": "استوديو منشورات LinkedIn",
    "landing2.f.studio.d":
      "حوّل إنجازًا مؤكدًا إلى منشور بالعربية أو الإنجليزية وبالنبرة المناسبة. تُفحص الادعاءات قبل النشر، ولا يُنشر شيء دون تأكيد صريح منك.",
    "landing2.f.studio.tones": "النبرات المتاحة",
    "landing2.f.cv.t": "سيرة ذاتية رئيسية حيّة",
    "landing2.f.cv.d": "بإصدارات محفوظة وكشف للتكرار. استعد أي نسخة سابقة وصدّر سيرتك بصيغة PDF أو Word.",
    "landing2.f.jobs.t": "اكتشاف الوظائف ومطابقتها",
    "landing2.f.jobs.d": "تصفّح فرصًا مقترحة بناءً على سيرتك، واحفظ ما يناسبك، واعرف المتطلبات التي تغطيها أدلتك.",
    "landing2.f.tailor.t": "تخصيص صادق",
    "landing2.f.tailor.d": "يعيد ترتيب ما لديك وصياغته لوظيفة محددة، وتُستبعد النقاط التي لا تجتاز التحقق بالأدلة.",
    "landing2.f.gap.t": "فجوات المهارات وخطة التعلم",
    "landing2.f.gap.d": "يفرّق بين المهارات التي تنقصك والمهارات التي تملكها دون دليل بعد، ثم يقترح خطة للتعلم.",
    "landing2.f.lang.t": "العربية والإنجليزية",
    "landing2.f.lang.d": "اكتب واقرأ وأنشئ المحتوى بأي من اللغتين، مع دعم كامل للكتابة من اليمين إلى اليسار.",

    /* privacy */
    "landing2.pv.eyebrow": "الخصوصية والتحكم",
    "landing2.pv.title": "بياناتك وقراراتك لك",
    "landing2.pv.sub": "يحدّ وصل مما يطّلع عليه مزوّدو الذكاء الاصطناعي، وتقرر أنت ما يظهر في سيرتك.",
    "landing2.pv.pii.t": "إخفاء بياناتك الشخصية",
    "landing2.pv.pii.d":
      "قبل إرسال أي نص إلى مزوّد ذكاء اصطناعي، يُستبدل اسمك وبريدك الإلكتروني ورقم هاتفك وأرقام الهوية والجواز والحسابات البنكية والبطاقات وروابط حساباتك وعناوينك ومفاتيح API برموز بديلة، ثم يعيدها وصل محليًا في النتيجة.",
    "landing2.pv.providers.t": "مزوّدون يستوفون معايير الخصوصية",
    "landing2.pv.providers.d":
      "لا تُرسل مهام الذكاء الاصطناعي التي تتضمن بياناتك المهنية إلا إلى مزوّدين يستوفون الحد الأدنى لمستوى الخصوصية في وصل، وإن لم يتوفر أي منهم فلا يُرسل شيء.",
    "landing2.pv.byok.t": "استخدم مفتاحك الخاص",
    "landing2.pv.byok.d":
      "استخدم ذكاء وصل الاصطناعي أو اربط مفتاح مزوّدك الخاص. تُتحقق صلاحية المفاتيح لدى المزوّد، وتُخزَّن مشفّرة، ولا تُعرض كاملة مرة أخرى.",
    "landing2.pv.guard.t": "النصوص المرفوعة تُعامل كبيانات",
    "landing2.pv.guard.d":
      "تُفحص المستندات وملفات المستودعات بحثًا عن تعليمات موجّهة إلى الذكاء الاصطناعي، وتُمرَّر إلى النموذج كبيانات لا كأوامر.",
    "landing2.pv.approve.t": "لا شيء يتغير دونك",
    "landing2.pv.approve.d": "لا تعدّل اقتراحات الذكاء الاصطناعي سيرتك الرئيسية ولا تنشر على LinkedIn من تلقاء نفسها.",
    "landing2.pv.data.t": "التصدير أو الحذف",
    "landing2.pv.data.d": "صدّر سيرتك بصيغة PDF أو Word في أي وقت. وعند حذف حسابك تُحذف البيانات المخزنة معه.",

    /* closing */
    "landing2.end.title": "ابدأ بإنجاز واحد.",
    "landing2.end.sub": "وثّقه مرة واحدة، ويساعدك وصل على إعادة استخدامه بدقة في كل مكان.",
    "landing2.end.signin": "لديك حساب؟ سجّل الدخول",

    /* footer */
    "landing2.foot.product": "المنتج",
    "landing2.foot.account": "الحساب",
    "landing2.foot.rights": "© 2026 وصل",
  },
);
