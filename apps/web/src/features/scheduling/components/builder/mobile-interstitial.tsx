import { Button } from '@church/ui/components/button';

interface MobileInterstitialProps {
  onContinue: () => void;
}

export function MobileInterstitial({ onContinue }: MobileInterstitialProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <h2 className="font-bold text-lg">Best on a larger screen</h2>
      <p className="max-w-sm text-muted-foreground text-sm">
        The schedule builder is designed for desktop. You can continue anyway,
        but the experience may be cramped on this device.
      </p>
      <Button
        type="button"
        onClick={() => {
          localStorage.setItem('builder-mobile-override', 'true');
          onContinue();
        }}
      >
        Continue anyway
      </Button>
    </div>
  );
}
