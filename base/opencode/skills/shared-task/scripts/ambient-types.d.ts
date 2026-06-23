// Ambient declarations for optional/runtime-only dependencies
// that are guarded by try/catch at runtime.
declare module 'open' {
  const open: (target: string) => Promise<void>;
  export default open;
}
