import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  Menu,
  MonitorSmartphone,
  Receipt,
  Clock3,
  X,
} from 'lucide-react'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { CookieBanner } from '@/components/marketing/CookieBanner'
import {
  DashboardPreview,
  ProductPreview,
  type PreviewTab,
} from '@/components/landing/ProductPreview'
import '@/styles/landing.css'

const features = [
  {
    id: 'invoices',
    label: 'Facturen',
    icon: FileText,
    title: 'Van afgerond werk naar een nette factuur.',
    description:
      'Kies je klant, voeg je werkzaamheden toe en controleer de btw. Je factuur krijgt een eigen nummer en is als PDF te downloaden.',
    bullets: [
      'Je klanten direct bij de hand',
      'Btw en totalen overzichtelijk',
      'Een PDF voor je klant en je archief',
    ],
  },
  {
    id: 'expenses',
    label: 'Uitgaven',
    icon: Receipt,
    title: 'Een bonnetje hoort bij een uitgave.',
    description:
      'Bewaar je kosten en bijlagen op dezelfde plek. Zo hoef je aan het einde van het kwartaal minder terug te zoeken.',
    bullets: [
      'Foto of PDF bij je uitgave',
      'Kosten geordend per categorie',
      'Terug te vinden voor je boekhouder',
    ],
  },
  {
    id: 'hours',
    label: 'Uren',
    icon: Clock3,
    title: 'Je tijd is werk. Houd hem bij.',
    description:
      'Registreer je uren per klant en opdracht. Gebruik je overzicht als basis voor je volgende factuur.',
    bullets: [
      'Uren vastleggen per klant',
      'Overzicht per periode',
      'Gewerkte uren omzetten naar factuurregels',
    ],
  },
] as const

const questions = [
  {
    question: 'Voor wie is ZZPers Hub bedoeld?',
    answer:
      'Voor zzp’ers en freelancers die hun facturen, klanten, uitgaven en uren op één plek willen bijhouden. Je hebt geen boekhoudachtergrond nodig om te beginnen.',
  },
  {
    question: 'Hoe werkt het gratis jaar?',
    answer:
      'Je begint met een gratis proefperiode van 365 dagen. Bij het aanmaken van je account is geen creditcard nodig. Bekijk de pakketten voor de voorwaarden en het abonnement na je proefperiode.',
  },
  {
    question: 'Kan ik mijn boekhouder erbij betrekken?',
    answer:
      'Ja. Je kunt je boekhouder uitnodigen om samen aan je administratie te werken. Je beheert de koppeling vanuit je account en kunt de toegang weer intrekken.',
  },
  {
    question: 'Werkt het ook op mijn telefoon?',
    answer:
      'Ja. Je gebruikt ZZPers Hub in de browser op je telefoon, tablet of laptop. Je kunt de webapp ook aan het beginscherm van je telefoon toevoegen.',
  },
]

function Brand() {
  return (
    <a className="lp-brand" href="/" aria-label="ZZPers Hub — naar de homepage">
      <span className="lp-brand-mark" aria-hidden="true">
        z<span>.</span>
      </span>
      <span>
        ZZPers<span className="lp-brand-hub"> Hub</span>
      </span>
    </a>
  )
}

export const LandingPage = () => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<PreviewTab>('invoices')
  const menuButton = useRef<HTMLButtonElement>(null)
  const feature = features.find((item) => item.id === activeTab)!

  useSeoMeta({
    title: 'ZZPers Hub | Facturen en boekhouding voor zzp’ers',
    description:
      'Je facturen, uitgaven, klanten en uren op één overzichtelijke plek. Ontdek ZZPers Hub voor zzp’ers en begin met een gratis proefjaar.',
    canonical: 'https://zzpershub.nl/',
  })

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    const closeOnResize = () => {
      if (window.innerWidth >= 1000) setMenuOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnResize)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnResize)
    }
  }, [menuOpen])

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % features.length
    else if (event.key === 'ArrowLeft')
      next = (index + features.length - 1) % features.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = features.length - 1
    else return
    event.preventDefault()
    setActiveTab(features[next].id)
    document.getElementById(`lp-tab-${features[next].id}`)?.focus()
  }

  return (
    <div className="landing-page">
      <a className="lp-skip" href="#main-content">
        Direct naar inhoud
      </a>
      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <Brand />
          <nav className="lp-desktop-nav" aria-label="Hoofdnavigatie">
            <a href="#voor-zzp">Het product</a>
            <a href="#hoe-werkt-het">Zo werkt het</a>
            <a href="#voor-accountants">Voor boekhouders</a>
            <a href="#prijzen">Prijzen</a>
          </nav>
          <div className="lp-header-actions">
            <a className="lp-login" href="/login">
              Inloggen <ArrowUpRight size={14} />
            </a>
            <a className="lp-button lp-button-small" href="/register">
              Start gratis <ArrowRight size={15} />
            </a>
          </div>
          <button
            ref={menuButton}
            className="lp-menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'}
            aria-expanded={menuOpen}
            aria-controls="lp-mobile-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {menuOpen && (
          <nav
            id="lp-mobile-nav"
            className="lp-mobile-nav lp-container"
            aria-label="Mobiele navigatie"
            onClick={() => setMenuOpen(false)}
          >
            <a href="#voor-zzp">Het product</a>
            <a href="#hoe-werkt-het">Zo werkt het</a>
            <a href="#voor-accountants">Voor boekhouders</a>
            <a href="#prijzen">Prijzen</a>
            <a href="/login">Inloggen</a>
            <a href="/register">
              Start gratis <ArrowRight size={16} />
            </a>
          </nav>
        )}
      </header>

      <main id="main-content">
        <section className="lp-hero">
          <div className="lp-container lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">
                <span /> VOOR ZELFSTANDIGE ONDERNEMERS
              </p>
              <h1>
                Meer ondernemen.
                <br />
                <em>Minder uitzoekwerk.</em>
              </h1>
              <p className="lp-hero-description">
                Je bent goed in je vak. Houd je administratie net zo goed bij.
                Facturen, uitgaven en uren op één plek, met overzicht voor jou
                én je boekhouder.
              </p>
              <div className="lp-hero-actions">
                <a href="/register" className="lp-button">
                  Begin je gratis jaar <ArrowRight size={18} />
                </a>
                <a href="#voor-zzp" className="lp-text-link">
                  Neem een kijkje <span aria-hidden="true">↗</span>
                </a>
              </div>
              <p className="lp-cta-note">
                <Check size={14} /> Geen creditcard nodig <span>·</span> Voor
                zzp’ers in Nederland
              </p>
            </div>
            <div className="lp-hero-visual">
              <span className="lp-visual-index" aria-hidden="true">
                MINDER LOSSE EINDJES. MEER OVERZICHT.
              </span>
              <DashboardPreview />
              <div className="lp-received-note">
                <span>
                  <Check size={16} />
                </span>
                <div>
                  <strong>Alles op zijn plek.</strong>
                  <small>Van je eerste factuur tot je btw-overzicht.</small>
                </div>
              </div>
            </div>
          </div>
          <div className="lp-container lp-hero-bottom">
            <span>Jouw werk. Jouw administratie.</span>
            <div>
              <span>
                <FileText size={16} /> Facturen & klanten
              </span>
              <span>
                <Receipt size={16} /> Uitgaven & bonnetjes
              </span>
              <span>
                <MonitorSmartphone size={16} /> Op elk scherm
              </span>
            </div>
          </div>
        </section>

        <section id="voor-zzp" className="lp-product lp-section">
          <div className="lp-container">
            <div className="lp-section-heading">
              <div>
                <p className="lp-eyebrow">01 / JE DAGELIJKSE WERK</p>
                <h2>
                  Een werkplek.
                  <br />
                  <em>Je hele administratie.</em>
                </h2>
              </div>
              <p>
                Van een opdracht afronden tot je kosten bijwerken. De dingen die
                bij ondernemen horen, logisch bij elkaar.
              </p>
            </div>
            <div
              className="lp-tabs"
              role="tablist"
              aria-label="Ontdek het product"
            >
              {features.map((item, index) => (
                <button
                  key={item.id}
                  id={`lp-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === item.id}
                  aria-controls="lp-feature-panel"
                  tabIndex={activeTab === item.id ? 0 : -1}
                  onKeyDown={(event) => moveTab(event, index)}
                  onClick={() => setActiveTab(item.id)}
                >
                  <item.icon size={18} />
                  {item.label}
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
            <div
              id="lp-feature-panel"
              className="lp-feature-panel"
              role="tabpanel"
              aria-labelledby={`lp-tab-${activeTab}`}
              tabIndex={0}
            >
              <div className="lp-feature-copy">
                <span className="lp-feature-number">
                  0{features.indexOf(feature) + 1}
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <ul>
                  {feature.bullets.map((bullet) => (
                    <li key={bullet}>
                      <Check size={16} />
                      {bullet}
                    </li>
                  ))}
                </ul>
                <a href="/register" className="lp-text-link">
                  Aan de slag <ArrowRight size={17} />
                </a>
              </div>
              <div className="lp-feature-art">
                <ProductPreview tab={activeTab} />
              </div>
            </div>
          </div>
        </section>

        <section id="hoe-werkt-het" className="lp-process lp-section">
          <div className="lp-container">
            <div className="lp-section-heading">
              <div>
                <p className="lp-eyebrow">02 / ZO WERKT HET</p>
                <h2>
                  Klein beginnen.
                  <br />
                  <em>Goed geregeld.</em>
                </h2>
              </div>
              <a className="lp-text-link" href="/help">
                Bekijk de startgids <ArrowUpRight size={18} />
              </a>
            </div>
            <ol className="lp-steps">
              {[
                {
                  title: 'Maak je werkplek aan',
                  text: 'Maak een account aan en vul je bedrijfsgegevens in. Dat is de basis voor je administratie.',
                },
                {
                  title: 'Leg je werk vast',
                  text: 'Voeg je eerste klant toe. Maak een factuur, registreer je uren of bewaar een bonnetje.',
                },
                {
                  title: 'Houd het overzicht',
                  text: 'Bekijk je openstaande facturen en je btw-overzicht. Deel je administratie met je boekhouder.',
                },
              ].map((step, index) => (
                <li key={step.title}>
                  <span>0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="voor-accountants" className="lp-accountant">
          <div className="lp-container lp-accountant-grid">
            <div>
              <p className="lp-eyebrow">SAMEN WERKT HET BETER</p>
              <h2>
                Jij onderneemt.
                <br />
                <em>Je boekhouder kijkt mee.</em>
              </h2>
              <p>
                Geen losse bestanden heen en weer. Nodig je boekhouder uit en
                werk vanuit dezelfde administratie. Jij beheert wie toegang
                heeft.
              </p>
              <a href="/contact" className="lp-text-link">
                Meer over samenwerken <ArrowUpRight size={18} />
              </a>
            </div>
            <div className="lp-access-preview">
              <span className="lp-access-label">
                ÉÉN ADMINISTRATIE, SAMEN OVERZICHT
              </span>
              <div>
                <span className="lp-person">J</span>
                <span>
                  <strong>Jij</strong>
                  <small>Je bedrijf, je administratie</small>
                </span>
                <span className="lp-access-role">Eigenaar</span>
              </div>
              <div>
                <span className="lp-person lp-person-accountant">B</span>
                <span>
                  <strong>Je boekhouder</strong>
                  <small>Verbonden via jouw uitnodiging</small>
                </span>
                <Check size={19} />
              </div>
              <p>Je kunt de toegang weer intrekken.</p>
            </div>
          </div>
        </section>

        <section id="prijzen" className="lp-pricing lp-section">
          <div className="lp-container lp-pricing-grid">
            <div>
              <p className="lp-eyebrow">03 / RUIMTE OM TE BEGINNEN</p>
              <h2>
                Leer het kennen.
                <br />
                <em>Een jaar lang.</em>
              </h2>
              <p>
                Een nieuwe manier van werken kies je niet in een middag. Neem de
                tijd om ZZPers Hub in je eigen werkdag te gebruiken.
              </p>
              <a href="/prijzen" className="lp-text-link">
                Bekijk alle pakketten en voorwaarden <ArrowUpRight size={17} />
              </a>
            </div>
            <div className="lp-trial">
              <div className="lp-trial-top">
                <span>Jouw eerste jaar</span>
                <span className="lp-trial-tag">Gratis proberen</span>
              </div>
              <p className="lp-trial-price">
                € 0<span>/ eerste jaar</span>
              </p>
              <p>
                Facturen, klanten, uren en uitgaven.
                <br />
                Een rustige start voor je administratie.
              </p>
              <a className="lp-button" href="/register">
                Begin je gratis jaar <ArrowRight size={18} />
              </a>
              <small>
                Geen creditcard bij aanmelding. Daarna kies je een betaald
                pakket. Bekijk de actuele tarieven op de prijzenpagina.
              </small>
            </div>
          </div>
        </section>

        <section className="lp-faq lp-section">
          <div className="lp-container lp-faq-grid">
            <div>
              <p className="lp-eyebrow">GOED OM TE WETEN</p>
              <h2>Nog een vraag?</h2>
              <a href="/faq" className="lp-text-link">
                Alle veelgestelde vragen <ArrowUpRight size={17} />
              </a>
            </div>
            <div>
              {questions.map((item) => (
                <details key={item.question}>
                  <summary>
                    {item.question}
                    <ChevronDown size={18} />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-final">
          <div className="lp-container">
            <p>MEER TIJD VOOR JE VAK</p>
            <h2>
              Een goed begin.
              <br />
              <em>Een helder overzicht.</em>
            </h2>
            <a className="lp-button lp-button-cream" href="/register">
              Maak je werkplek aan <ArrowRight size={18} />
            </a>
            <span>Je eerste jaar is gratis.</span>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-top">
            <div>
              <Brand />
              <p>
                Administratie voor mensen
                <br />
                die liever ondernemen.
              </p>
            </div>
            <div>
              <strong>Ontdek</strong>
              <a href="#voor-zzp">Het product</a>
              <a href="/prijzen">Pakketten & prijzen</a>
              <a href="/help">Startgids</a>
              <a href="/login">Inloggen</a>
            </div>
            <div>
              <strong>We helpen je graag</strong>
              <a href="/contact">Contact opnemen</a>
              <a href="/faq">Veelgestelde vragen</a>
              <a href="mailto:info@zzpershub.nl">info@zzpershub.nl</a>
            </div>
            <div>
              <strong>Gemaakt door MHM IT</strong>
              <span>Alkmaar, Nederland</span>
              <span>KvK 69779716</span>
              <a href="/contact">
                Voor boekhouders <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <div className="lp-footer-bottom">
            <span>© {new Date().getFullYear()} ZZPers Hub</span>
            <nav aria-label="Juridische informatie">
              <a href="/privacy">Privacy</a>
              <a href="/cookies">Cookies</a>
              <a href="/terms">Voorwaarden</a>
              <a href="/disclaimer">Disclaimer</a>
            </nav>
            <a href="#main-content">Terug naar boven ↑</a>
          </div>
        </div>
      </footer>
      <CookieBanner />
    </div>
  )
}
