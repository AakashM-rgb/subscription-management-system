import React, { useState, useMemo } from 'react';
import { generateQrMatrix } from '../../lib/qrCode';
import { formatCurrency } from '../../lib/currency';
import { Check, Copy, ExternalLink, QrCode, ShieldCheck, Sparkles, Smartphone } from 'lucide-react';

export type UpiAppType = 'all' | 'gpay' | 'phonepe' | 'paytm';

interface UpiQrPaymentProps {
  amount: number;
  invoiceNumber: string;
  customerName?: string;
  upiId?: string;
  payeeName?: string;
  onUtrGenerated?: (utr: string) => void;
}

export const UpiQrPayment: React.FC<UpiQrPaymentProps> = ({
  amount,
  invoiceNumber,
  customerName,
  upiId = 'brightloop.billing@okhdfcbank',
  payeeName = 'Brightloop Software Pvt Ltd',
  onUtrGenerated,
}) => {
  const [selectedApp, setSelectedApp] = useState<UpiAppType>('all');
  const [copied, setCopied] = useState(false);
  const [generatedUtr, setGeneratedUtr] = useState<string | null>(null);

  // Construct NPCI Standard UPI Intent URI
  const upiLink = useMemo(() => {
    const cleanAmount = Math.max(0, amount).toFixed(2);
    const cleanNote = encodeURIComponent(`Invoice ${invoiceNumber}`);
    const cleanPayee = encodeURIComponent(payeeName);
    const tr = `SUB${invoiceNumber.replace(/[^0-9]/g, '')}`;

    return `upi://pay?pa=${upiId}&pn=${cleanPayee}&am=${cleanAmount}&cu=INR&tn=${cleanNote}&tr=${tr}`;
  }, [amount, invoiceNumber, payeeName, upiId]);

  // App-specific deeplink prefixes for mobile apps
  const appDeeplink = useMemo(() => {
    switch (selectedApp) {
      case 'gpay':
        return upiLink.replace('upi://', 'tez://upi/');
      case 'phonepe':
        return upiLink.replace('upi://', 'phonepe://');
      case 'paytm':
        return upiLink.replace('upi://', 'paytmmp://');
      default:
        return upiLink;
    }
  }, [upiLink, selectedApp]);

  // Generate QR code matrix modules
  const qrMatrix = useMemo(() => {
    try {
      return generateQrMatrix(upiLink);
    } catch (e) {
      console.error('Failed to generate UPI QR code matrix:', e);
      return [];
    }
  }, [upiLink]);

  const handleCopyUpi = () => {
    navigator.clipboard?.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateSimulatedUtr = () => {
    // Generate realistic 12-digit Indian Banking UPI UTR
    const timestamp = Date.now().toString().slice(-6);
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const utr = `${timestamp}${randomDigits}`;
    setGeneratedUtr(utr);
    if (onUtrGenerated) {
      onUtrGenerated(`UPI-${utr}`);
    }
  };

  return (
    <div className="bg-gradient-to-b from-slate-50 to-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>UPI Instant Payment</span>
              <span className="inline-flex items-center gap-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                <ShieldCheck className="w-2.5 h-2.5" /> Verified
              </span>
            </h4>
            <p className="text-[10px] text-slate-500">Scan using any UPI App</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-400 font-medium block">Total Payable</span>
          <span className="text-sm font-extrabold text-blue-700 tracking-tight">
            {formatCurrency(amount)}
          </span>
        </div>
      </div>

      {/* App Selector Tabs (All, GPay, PhonePe, Paytm) */}
      <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100/90 rounded-xl text-xs font-semibold">
        <button
          type="button"
          onClick={() => setSelectedApp('all')}
          className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 text-[11px] ${
            selectedApp === 'all'
              ? 'bg-white text-slate-900 shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>All UPI</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedApp('gpay')}
          className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 text-[11px] ${
            selectedApp === 'gpay'
              ? 'bg-white text-blue-600 shadow-sm font-bold'
              : 'text-slate-600 hover:text-blue-600'
          }`}
        >
          <span className="font-bold">GPay</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedApp('phonepe')}
          className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 text-[11px] ${
            selectedApp === 'phonepe'
              ? 'bg-white text-purple-700 shadow-sm font-bold'
              : 'text-slate-600 hover:text-purple-700'
          }`}
        >
          <span className="font-bold">PhonePe</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedApp('paytm')}
          className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 text-[11px] ${
            selectedApp === 'paytm'
              ? 'bg-white text-sky-600 shadow-sm font-bold'
              : 'text-slate-600 hover:text-sky-600'
          }`}
        >
          <span className="font-bold">Paytm</span>
        </button>
      </div>

      {/* Central QR Code Canvas & App Branding */}
      <div className="flex flex-col items-center justify-center bg-white border border-slate-200/80 rounded-2xl p-5 shadow-inner">
        {/* Scannable SVG QR Code */}
        {qrMatrix.length > 0 ? (
          <div className="relative p-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
            <svg
              viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
              className="w-44 h-44 sm:w-48 sm:h-48"
              shapeRendering="crispEdges"
            >
              {qrMatrix.map((row, r) =>
                row.map((isDark, c) =>
                  isDark ? (
                    <rect
                      key={`${r}-${c}`}
                      x={c}
                      y={r}
                      width={1}
                      height={1}
                      fill={
                        selectedApp === 'phonepe'
                          ? '#5f259f'
                          : selectedApp === 'paytm'
                          ? '#002970'
                          : selectedApp === 'gpay'
                          ? '#1a73e8'
                          : '#0f172a'
                      }
                    />
                  ) : null
                )
              )}
            </svg>

            {/* Central Badge Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-9 h-9 rounded-lg bg-white shadow-md border border-slate-200 flex items-center justify-center">
                {selectedApp === 'gpay' && (
                  <span className="text-[11px] font-extrabold text-blue-600 tracking-tighter">GPay</span>
                )}
                {selectedApp === 'phonepe' && (
                  <span className="text-[10px] font-extrabold text-purple-700 tracking-tighter">Pe</span>
                )}
                {selectedApp === 'paytm' && (
                  <span className="text-[10px] font-extrabold text-sky-600 tracking-tighter">Paytm</span>
                )}
                {selectedApp === 'all' && (
                  <span className="text-[9px] font-extrabold text-orange-600 tracking-tighter">UPI</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="w-44 h-44 flex items-center justify-center bg-slate-50 text-slate-400 text-xs rounded-xl">
            Generating QR Code...
          </div>
        )}

        {/* Accepted App Badges */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-slate-700">Google Pay</span>
          <span className="px-1.5 py-0.5 rounded bg-purple-50 font-semibold text-purple-700">PhonePe</span>
          <span className="px-1.5 py-0.5 rounded bg-sky-50 font-semibold text-sky-700">Paytm</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 font-semibold text-emerald-700">BHIM UPI</span>
        </div>
      </div>

      {/* Payee Info & Copy Section */}
      <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3 text-xs space-y-1.5">
        <div className="flex justify-between items-center text-slate-600">
          <span className="text-slate-500 text-[11px]">Payee VPA:</span>
          <div className="flex items-center gap-1.5">
            <code className="font-mono text-slate-800 text-[11px] font-semibold">{upiId}</code>
            <button
              type="button"
              onClick={handleCopyUpi}
              className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-white transition-colors"
              title="Copy UPI ID"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center text-slate-600">
          <span className="text-slate-500 text-[11px]">Merchant Name:</span>
          <span className="font-semibold text-slate-800 text-[11px]">{payeeName}</span>
        </div>

        <div className="flex justify-between items-center text-slate-600">
          <span className="text-slate-500 text-[11px]">Invoice Remark:</span>
          <span className="font-semibold text-slate-800 text-[11px]">Invoice {invoiceNumber}</span>
        </div>
      </div>

      {/* Action Buttons: Mobile Direct Pay & Demo UTR Filler */}
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <a
          href={appDeeplink}
          className="w-full sm:flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Pay via {selectedApp === 'all' ? 'UPI App' : selectedApp === 'gpay' ? 'Google Pay' : selectedApp === 'phonepe' ? 'PhonePe' : 'Paytm'}</span>
          <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
        </a>

        <button
          type="button"
          onClick={handleGenerateSimulatedUtr}
          className="w-full sm:w-auto py-2 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          title="Simulate scanning & payment on phone"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Simulate Scanned (Auto UTR)</span>
        </button>
      </div>

      {generatedUtr && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Scanned payment verified! UPI UTR auto-filled: <strong>UPI-{generatedUtr}</strong>
          </span>
        </div>
      )}
    </div>
  );
};

