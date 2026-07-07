"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { TradeCandle } from "./useHyperliquidFeed";
import styles from "./trade-ui.module.css";

export default function LiveChart({
  candles,
  interval,
  onIntervalChange,
}: {
  candles: TradeCandle[];
  interval: string;
  onIntervalChange: (interval: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { color: "#fffdf5" }, textColor: "#111111", fontFamily: "IBM Plex Mono" },
      grid: { vertLines: { color: "#efe5c9" }, horzLines: { color: "#efe5c9" } },
      rightPriceScale: { borderColor: "#111111" },
      timeScale: { borderColor: "#111111", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#88d498",
      downColor: "#ff7ba5",
      borderUpColor: "#111111",
      borderDownColor: "#111111",
      wickUpColor: "#111111",
      wickDownColor: "#111111",
    });
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "#74b9ff",
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    return () => chart.remove();
  }, []);

  useEffect(() => {
    const candleData: CandlestickData[] = candles.map((candle) => ({
      time: Math.floor(candle.time / 1000) as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    const volumeData: HistogramData[] = candles.map((candle) => ({
      time: Math.floor(candle.time / 1000) as Time,
      value: candle.volume,
      color: candle.close >= candle.open ? "#88d498" : "#ff7ba5",
    }));
    candleSeriesRef.current?.setData(candleData);
    volumeSeriesRef.current?.setData(volumeData);
  }, [candles]);

  return (
    <section className={styles.chartPanel}>
      <div className={styles.panelHeaderCompact}>
        <div>
          <span className={styles.kicker}>Chart</span>
          <p>Hyperliquid candles</p>
        </div>
        <div className={styles.timeframeRow}>
          {["1m", "5m", "15m", "1h", "1d"].map((item) => (
            <button
              key={item}
              aria-pressed={interval === item}
              className={styles.timeframeButton}
              type="button"
              onClick={() => onIntervalChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className={styles.chartCanvas}>
        {candles.length === 0 ? <p className={styles.emptyText}>Waiting for live candles...</p> : null}
      </div>
    </section>
  );
}
