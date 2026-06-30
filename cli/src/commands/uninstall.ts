export interface UninstallOptions {
  repo: string;
  dryRun: boolean;
}

export async function uninstallCommand(options: UninstallOptions): Promise<void> {
  console.log(`uninstall: ${options.repo}`);
  process.exit(0);
}
