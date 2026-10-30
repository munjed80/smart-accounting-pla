import { BrandLockup } from '@/components/BrandLockup'
import { PrepaidPlanCards } from '@/components/PrepaidPlanCards'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { MarketingFooter } from '@/components/marketing/Footer'
import { CookieBanner } from '@/components/marketing/CookieBanner'
import { ArrowRight, Check } from 'lucide-react'

export const PrijzenPage = () => {
  useSeoMeta({
    title: 'Pakketten en prijzen | ZZPers Hub',
    description: 'Begin 3 maanden gratis. Daarna 1 maand voor €6, 3 maanden voor €14, 6 maanden voor €25 of een jaar voor €39. Eenmalig betalen, geen automatische verlenging.',
    canonical: 'https://zzpershub.nl/prijzen',
  })
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-5">
      <a href="/" aria-label="ZZPers Hub — homepage"><BrandLockup size="md" /></a>
      <a className="text-sm font-medium" href="/login">Inloggen</a>
    </div></header>
    <main className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
      <div className="max-w-2xl mb-12">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-4">Eén werkplek. Jouw looptijd.</p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">Eerst drie maanden gratis.<br /><span className="text-primary">Daarna kies jij.</span></h1>
        <p className="text-muted-foreground mt-6 leading-relaxed">Geen creditcard bij aanmelding. Alle ZZP-functies in ieder pakket. Je kiest alleen hoe lang je toegang wilt, en betaalt de hele periode in één keer.</p>
        <a href="/register" className="inline-flex items-center gap-8 rounded-lg bg-primary text-primary-foreground px-6 py-4 font-medium mt-7">Start 3 maanden gratis <ArrowRight size={18} /></a>
      </div>
      <PrepaidPlanCards />
      <p className="text-sm text-muted-foreground mt-5">Totaal per gekozen periode. Geen automatische verlenging. Koop je al tijdens je proefperiode of lopende toegang? Je betaalt nu; je nieuwe looptijd sluit daarop aan.</p>
      <section className="grid gap-10 md:grid-cols-2 mt-16 border-t border-border pt-12">
        <div><h2 className="text-2xl font-semibold tracking-tight">In elk pakket inbegrepen</h2><ul className="mt-6 space-y-3 text-sm">
          {['Facturen en offertes', 'Klanten en uitgaven met bijlagen', 'Urenregistratie en agenda', 'Btw-overzicht en documenten', 'Shopify- en WooCommerce-koppelingen', 'Samenwerken met je boekhouder', 'Gebruik op telefoon, tablet en computer'].map(text => <li className="flex items-start gap-3" key={text}><Check size={17} className="text-primary shrink-0" />{text}</li>)}
        </ul></div>
        <div className="rounded-xl border border-border bg-card p-7"><h2 className="text-2xl font-semibold tracking-tight">Voor boekhouders</h2><p className="mt-4 text-muted-foreground leading-relaxed">Beheer de administraties van je klanten vanuit één werkomgeving. Neem contact op voor afspraken op basis van je kantoor en klantvolume.</p><a href="/contact" className="inline-flex items-center gap-3 text-primary font-medium mt-6">Contact opnemen <ArrowRight size={17} /></a></div>
      </section>
      <section className="mt-16 border-t border-border pt-10"><h2 className="text-2xl font-semibold">Helder vooraf</h2><div className="grid gap-8 md:grid-cols-3 mt-6 text-sm leading-relaxed">
        <div><h3 className="font-semibold mb-2">Wanneer begint mijn pakket?</h3><p className="text-muted-foreground">Na de bevestigde betaling. Resterende gratis of betaalde toegang blijft behouden: je nieuwe periode sluit daarop aan.</p></div>
        <div><h3 className="font-semibold mb-2">Moet ik opzeggen?</h3><p className="text-muted-foreground">De nieuwe pakketten stoppen vanzelf op de einddatum. Je koopt zelf een nieuwe periode als je wilt doorgaan.</p></div>
        <div><h3 className="font-semibold mb-2">Heb ik al een abonnement?</h3><p className="text-muted-foreground">Bestaande toegekende looptijden blijven behouden. Een bestaand automatisch abonnement blijft apart beheerd in je instellingen.</p></div>
      </div></section>
    </main>
    <MarketingFooter /><CookieBanner />
  </div>
}
