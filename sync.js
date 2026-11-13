/* Liga a pagina ao Supabase com a mesma interface que a versao claude.ai usava:
   window.claude.use('db') -> db.collection(nome).onSnapshot(...) / .doc(id).set(...) / .delete() */
(function(){
  const cfg = window.LSR_CONFIG || {};
  const ok = window.supabase && cfg.SUPABASE_URL && !/COLOCA-AQUI/.test(cfg.SUPABASE_URL + cfg.SUPABASE_KEY);
  const PIN_KEY = 'lsr-pin';
  const getPin = () => { try { return localStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; } };
  const setPin = p => { try { p ? localStorage.setItem(PIN_KEY, p) : localStorage.removeItem(PIN_KEY); } catch (e) {} };
  let reader = null, writer = null, writerPin = null;
  function client(pin){
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
      auth: { persistSession: false },
      global: { headers: pin ? { 'x-team-pin': pin } : {} }
    });
  }
  async function ensurePin(){
    let pin = getPin();
    if (pin) return pin;
    pin = (window.prompt('PIN da equipa para editar (só é pedido uma vez neste aparelho):') || '').trim();
    if (!pin) throw new Error('sem PIN');
    const { data, error } = await reader.rpc('check_pin', { p: pin });
    if (error || data !== true) { alert('PIN errado.'); throw new Error('PIN errado'); }
    setPin(pin);
    return pin;
  }
  async function w(){
    const pin = await ensurePin();
    if (!writer || writerPin !== pin) { writer = client(pin); writerPin = pin; }
    return writer;
  }
  function fail(e){ if (/42501|row-level|PIN/i.test(String(e && (e.code || e.message)))) setPin(''); throw e; }
  function collection(name){
    return {
      doc(id){
        return {
          async set(data){
            const c = await w();
            const { data: rows, error } = await c.from('lsr_docs').upsert({ coll: name, id, data, updated_at: new Date().toISOString() }, { onConflict: 'coll,id' }).select('id');
            if (error || !rows || !rows.length) fail(error || new Error('PIN recusado'));
          },
          async delete(){
            const c = await w();
            const { error } = await c.from('lsr_docs').delete().eq('coll', name).eq('id', id);
            if (error) fail(error);
          }
        };
      },
      onSnapshot(cb, onErr){
        let alive = true;
        const load = async () => {
          const { data, error } = await reader.from('lsr_docs').select('id,data').eq('coll', name).limit(5000);
          if (!alive) return;
          if (error) { onErr && onErr(error); return; }
          cb({ metadata: { fromCache: false }, docs: data.map(r => ({ id: r.id, data: () => r.data })) });
        };
        load();
        const ch = reader.channel('lsr-' + name)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'lsr_docs', filter: 'coll=eq.' + name }, () => load())
          .subscribe();
        // rede de seguranca: volta a ler quando o telemovel acorda ou volta a ter rede
        const again = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', again);
        window.addEventListener('online', load);
        return () => { alive = false; reader.removeChannel(ch); document.removeEventListener('visibilitychange', again); window.removeEventListener('online', load); };
      }
    };
  }
  const db = ok ? { collection } : null;
  if (ok) reader = client('');
  window.claude = { use: async n => (n === 'db' ? db : null) };
})();
