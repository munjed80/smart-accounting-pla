import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, FileText, Pause, Play, RotateCcw } from 'lucide-react'
import './start-guide.css'

const steps = [
  { name: 'Bedrijfsprofiel', page: 'Instellingen', title: 'Begin met je bedrijfsgegevens.', description: 'Open Instellingen en vul je bedrijfsnaam, adres, KVK-nummer, btw-nummer en IBAN in. Klik op Profiel opslaan.', action: 'Profiel opslaan', success: 'Bedrijfsprofiel opgeslagen' },
  { name: 'Eerste klant', page: 'Klanten', title: 'Voeg je eerste klant toe.', description: 'Open Klanten en voeg een klant toe. Controleer de naam, het e-mailadres en het factuuradres. Klik op Klant opslaan.', action: 'Klant opslaan', success: 'Klant toegevoegd' },
  { name: 'Factuur maken', page: 'Facturen', title: 'Zet je werk op een factuur.', description: 'Maak een nieuwe factuur, selecteer je klant en voeg je werkzaamheden, aantal, prijs en btw toe. Controleer de datums en sla de factuur op.', action: 'Factuur opslaan', success: 'Conceptfactuur opgeslagen' },
  { name: 'Versturen', page: 'Facturen', title: 'Controleer en verstuur.', description: 'Open de acties bij je conceptfactuur en kies Verzenden. Controleer vooraf het e-mailadres van je klant en je factuurgegevens.', action: 'Verzenden', success: 'Factuur per e-mail verzonden' },
  { name: 'Betaling', page: 'Facturen', title: 'Ontvangen? Registreer de betaling.', description: 'Zodra het bedrag op je rekening staat, open je de factuuracties en kies je Markeer als betaald. Deze actie registreert de betaling; ze voert geen bankbetaling uit.', action: 'Markeer als betaald', success: 'Betaling geregistreerd · Betaald' },
] as const
const duration = 15
const total = steps.length * duration

function DemoField({ label, value, visible }: { label: string; value: string; visible: boolean }) {
  return <div className="sg-field"><span>{label}</span><div>{visible ? value : <span className="sg-placeholder">Nog invullen</span>}</div></div>
}

export function StartGuide() {
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const index = Math.min(Math.floor(elapsed / duration), steps.length - 1)
  const phase = elapsed - index * duration
  const step = steps[index]
  const saved = phase >= 11

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setElapsed(value => Math.min(total, value + 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [playing])
  useEffect(() => {
    if (elapsed === total) setPlaying(false)
  }, [elapsed])

  function select(next: number) { setElapsed(Math.max(0, Math.min(steps.length - 1, next)) * duration) }
  function toggle() { if (elapsed === total) setElapsed(0); setPlaying(value => !value) }

  return <section id="startgids" className="lp-section sg-section" aria-labelledby="sg-title">
    <div className="lp-container">
      <div className="lp-section-heading"><div><p className="lp-eyebrow">IN 5 STAPPEN OP WEG</p><h2 id="sg-title">Van eerste klant.<br /><em>Tot betaalde factuur.</em></h2></div><p>Bekijk de bewegende uitleg in 75 seconden. Pauzeer wanneer je zelf aan de slag wilt, of kies direct een stap.</p></div>
      <div className="sg-player" role="group" aria-label="Startgids voor ZZPers Hub">
        <ol className="sg-chapters" aria-label="Stappen">{steps.map((item, i) => <li key={item.name}><button type="button" onClick={() => select(i)} aria-current={i === index ? 'step' : undefined}><span>{i + 1}</span>{' '}{item.name}</button></li>)}</ol>
        <div className="sg-body">
          <div className="sg-instruction"><p className="lp-eyebrow">STAP {index + 1} / 5</p><h3>{step.title}</h3><p>{step.description}</p><div className="sg-tip"><Check size={18} aria-hidden="true" /><span>{saved ? step.success : 'Volg de aanwijzingen in het voorbeeld.'}</span></div><small>Voorbeeld met fictieve gegevens. De schermen zijn vereenvoudigd.</small></div>
          <div className="sg-screen" aria-label={`Voorbeeld: ${step.page}`}>
            <div className="sg-screen-bar"><strong><span>Z.</span> ZZPers Hub</strong><small>DEMO</small></div>
            <div className="sg-app"><aside aria-hidden="true">{['Overzicht', 'Klanten', 'Facturen', 'Instellingen'].map(name => <span key={name} className={name === step.page ? 'sg-nav-active' : ''}>{name}</span>)}</aside><div className="sg-content" key={index}>
              <div className="sg-screen-heading"><h4>{index === 0 ? 'Bedrijfsprofiel' : index === 1 ? 'Nieuwe klant' : index === 2 ? 'Nieuwe factuur' : 'Factuur 2026-001'}</h4>{index > 1 && <span className="sg-badge">{index === 4 ? saved ? 'Betaald' : 'Verzonden' : index === 3 && saved ? 'Verzonden' : 'Concept'}</span>}</div>
              {index < 2 ? <div className="sg-fields">
                {(index === 0 ? [['Bedrijfsnaam', 'Studio Noord (voorbeeld)'], ['Adres', 'Voorbeeldstraat 12'], ['Postcode en plaats', '1234 AB Voorbeeldstad'], ['KVK-nummer', 'Je eigen KVK-nummer'], ['Btw-nummer', 'Je eigen btw-nummer'], ['IBAN', 'Je zakelijke IBAN']] : [['Naam', 'Voorbeeldklant B.V.'], ['E-mail', 'klant@example.com'], ['Straat en huisnummer', 'Demolaan 24'], ['Postcode', '2345 BC'], ['Plaats', 'Voorbeeldstad'], ['Land', 'Nederland']]).map(([label, value], i) => <DemoField key={label} label={label} value={value} visible={phase >= i + 1} />)}
              </div> : <>
                <div className="sg-customer"><FileText size={22} aria-hidden="true" /><div><strong>Voorbeeldklant B.V.</strong><span>klant@example.com</span></div></div>
                {index === 2 && <div className="sg-fields"><DemoField label="Factuurdatum" value="01-11-2026" visible={phase >= 1} /><DemoField label="Vervaldatum" value="15-11-2026" visible={phase >= 2} /></div>}
                <div className="sg-line-item"><span>Omschrijving</span><strong>{index !== 2 || phase >= 4 ? 'Ontwerpwerk (voorbeeld)' : 'Voeg je werkzaamheden toe'}</strong><span>1 × € 100,00 · btw 21%</span></div>
                <dl className="sg-totals"><div><dt>Excl. btw</dt><dd>€ 100,00</dd></div><div><dt>Btw 21%</dt><dd>€ 21,00</dd></div><div><dt>Totaal</dt><dd>€ 121,00</dd></div></dl>
                {index === 4 && <p className="sg-payment-note">Controleer eerst of je het bedrag hebt ontvangen.</p>}
              </>}
              <div className={`sg-demo-action ${phase >= 8 && !saved ? 'sg-action-highlight' : ''}`}><span>{saved ? <><Check size={16} aria-hidden="true" /> Opgeslagen</> : step.action}</span><small>{saved ? step.success : phase >= 8 ? 'Klik om te bevestigen' : 'Vul eerst de gegevens in'}</small></div>
            </div></div>
          </div>
        </div>
        <div className="sg-controls"><button type="button" className="sg-play" onClick={toggle}>{playing ? <Pause size={18} /> : <Play size={18} />} {playing ? 'Pauzeren' : elapsed === total ? 'Opnieuw afspelen' : 'Uitleg afspelen'}</button><button type="button" onClick={() => { setElapsed(0); setPlaying(false) }} aria-label="Startgids opnieuw beginnen"><RotateCcw size={18} /></button><input type="range" min={0} max={total} step={1} value={elapsed} onChange={event => setElapsed(Number(event.target.value))} aria-label="Tijdlijn startgids" aria-valuetext={`${elapsed} van ${total} seconden`} /><span className="sg-time">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} / 1:15</span><button type="button" onClick={() => select(index - 1)} disabled={index === 0} aria-label="Vorige stap"><ChevronLeft size={18} /></button><button type="button" onClick={() => select(index + 1)} disabled={index === steps.length - 1} aria-label="Volgende stap"><ChevronRight size={18} /></button></div>
        <p className="sg-complete" role="status">{elapsed === total ? 'Je bent klaar voor je eerste factuur. Start je gratis proefperiode wanneer je wilt.' : ''}</p>
      </div>
    </div>
  </section>
}
