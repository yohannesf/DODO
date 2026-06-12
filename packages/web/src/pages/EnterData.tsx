import { Page } from './Page';

export function EnterData() {
  return (
    <Page number="01" title="Enter Data">
      <p data-testid="enter-data-empty">
        Nothing to enter yet. Data entry opens once an administrator creates a dataset,
        assigns it to your org units, and gives you data-entry access — all under
        Configure.
      </p>
      <p className="mt-2">
        Entry works fully offline: values save to this device instantly and synchronize
        when connectivity returns.
      </p>
    </Page>
  );
}
