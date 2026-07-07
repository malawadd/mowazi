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
  onLoadMore,
}: {
  candles: TradeCandle[];
  interval: string;
  onIntervalChange: (interval: string) => void;
  onLoadMore?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const candlesRef = useRef(candles);
  const onLoadMoreRef = useRef(onLoadMore);
  const prevLenRef = useRef(0);
  const firstTimeRef = useRef<number | null>(null);
  candlesRef.current = candles;
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { color: "#fffdf5" }, textColor: "#111111", fontFamily: "IBM Plex Mono" },
      grid: { vertLines: { color: "#efe5c9" }, horzLines: { color: "#efe5c9" } },
      rightPriceScale: { borderColor: "#111111" },
      timeScale: { borderColor: "#111111", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;
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

    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && (width !== lastW || height !== lastH)) {
          lastW = width;
          lastH = height;
          chart.resize(width, height);
        }
      }
    });
    observer.observe(container);

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      const loadMore = onLoadMoreRef.current;
      if (loadMore) {
        if (!range) return;
        const current = candlesRef.current;
        if (current.length === 0) return;
        const oldestVisible = (range.from as number) * 1000;
        const oldestLoaded = current[0].time;
        const visibleSpan = (range.to as number) - (range.from as number);
        if (oldestVisible - oldestLoaded < visibleSpan * 0.2) {
          loadMore();
        }
      }
    });

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

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

    const prevLen = prevLenRef.current;
    const prevFirst = firstTimeRef.current;
    const currFirst = candles.length > 0 ? candles[0].time : null;
    const isPrepend = prevFirst !== null && currFirst !== null && currFirst < prevFirst;

    // Full reset when data shrinks, first load, or historical data was prepended
    if (candles.length === 0 || prevLen === 0 || candles.length < prevLen || isPrepend) {
      candleSeries.setData(candleData);
      volumeSeries.setData(volumeData);
    } else if (candles.length > prevLen) {
      // Append: update only new candles (live feed)
      for (let i = prevLen; i < candleData.length; i++) candleSeries.update(candleData[i]);
      for (let i = prevLen; i < volumeData.length; i++) volumeSeries.update(volumeData[i]);
    } else {
      // Same length: update last candle in place (live tick)
      candleSeries.update(candleData[candleData.length - 1]);
      volumeSeries.update(volumeData[volumeData.length - 1]);
    }
    prevLenRef.current = candles.length;
    firstTimeRef.current = currFirst;
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
