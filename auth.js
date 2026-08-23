(function () {
  const cfg = window.GZ_CONFIG || {};
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  window.GZ = {
    configured,
    client: configured
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null,
  };
})();
