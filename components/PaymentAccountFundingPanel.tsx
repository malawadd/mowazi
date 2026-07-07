"use client";

import ConnectedWalletDepositPanel from "@/components/ConnectedWalletDepositPanel";

type Props = {
  receiverAddress: string | null;
  currentAddress?: string | null;
  originalAddress?: string | null;
  onSubmitted?: () => Promise<void> | void;
};

function sameAddress(first?: string | null, second?: string | null) {
  if (!first || !second) return true;
  return first.toLowerCase() === second.toLowerCase();
}

export default function PaymentAccountFundingPanel({
  receiverAddress,
  currentAddress,
  originalAddress,
  onSubmitted,
}: Props) {
  const walletChanged = !sameAddress(currentAddress, originalAddress);

  return (
    <div className="stack-list">
      {walletChanged ? (
        <p className="muted-copy">
          Return to your original payment account after funding to finish the payment.
        </p>
      ) : null}
      <ConnectedWalletDepositPanel
        receiverAddress={receiverAddress}
        recipientLabel="Your payment account"
        title="Add funds to payment account"
        description="Add funds from a wallet you control. After the transfer lands, Moeazi can settle the payment to the recipient."
        modeLabel="Fund payment account"
        submittedMessage="Funds sent. Refresh your payment account balance, then preview the payment."
        onSubmitted={onSubmitted}
      />
    </div>
  );
}
