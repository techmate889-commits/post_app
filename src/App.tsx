import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Square, Download, Clock, Users, AlertCircle, CheckCircle, FileText, Smartphone, Wifi, Battery } from 'lucide-react';

interface ProfileResult {
  username: string;
  post_date: string;
  error: boolean;
  processed?: boolean;
}

interface ProgressData {
  current: number;
  total: number;
  percentage: number;
  estimatedTime?: string;
}

function App() {
  const [usernames, setUsernames] = useState<string[]>([]);
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressData>({ current: 0, total: 0, percentage: 0 });
  const [fileName, setFileName] = useState('');
  const [minDelay, setMinDelay] = useState(5);
  const [maxDelay, setMaxDelay] = useState(7);
  const [resumeSession, setResumeSession] = useState(true);
  const [status, setStatus] = useState('Ready to start. Upload a file with usernames.');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    checkPreviousSession();

    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.head.appendChild(meta);
    }
  }, []);

  const checkPreviousSession = async () => {
    try {
      const savedProgress = localStorage.getItem('instagram_scraper_progress');
      const savedResults = localStorage.getItem('instagram_scraper_results');

      if (savedProgress && savedResults) {
        const progressData = JSON.parse(savedProgress);
        const resultsData = JSON.parse(savedResults);

        if (progressData.total > 0 && progressData.current > 0) {
          setResults(resultsData);
          setProgress(progressData);
          setStatus(`Previous session found: ${progressData.current}/${progressData.total} processed. Upload file to resume.`);
        }
      }
    } catch (error) {
      console.error('Error checking previous session:', error);
    }
  };

  const saveProgress = () => {
    try {
      localStorage.setItem('instagram_scraper_progress', JSON.stringify(progress));
      localStorage.setItem('instagram_scraper_results', JSON.stringify(results));
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'text/csv' || file.type === 'text/plain' || file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        processFile(file);
      } else {
        setStatus('Please upload a CSV or TXT file.');
      }
    }
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      let extractedUsernames: string[] = [];

      if (file.name.endsWith('.csv')) {
        const lines = content.split('\n');
        extractedUsernames = lines
          .map(line => line.split(',')[0].trim())
          .filter(username => username && username.length > 0);
      } else {
        extractedUsernames = content
          .split('\n')
          .map(line => line.trim())
          .filter(username => username && username.length > 0);
      }

      if (extractedUsernames.length > 0) {
        setUsernames(extractedUsernames);
        setProgress({ current: 0, total: extractedUsernames.length, percentage: 0 });
        setStatus(`Loaded ${extractedUsernames.length} usernames.`);
      } else {
        setStatus('No valid usernames found in file.');
      }
    };

    reader.readAsText(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const calculateEstimatedTime = (current: number, total: number) => {
    if (!startTime || current === 0) return '';

    const elapsedTime = (Date.now() - startTime) / 1000;
    const avgTimePerRequest = elapsedTime / current;
    const remaining = total - current;
    const estimatedSeconds = remaining * avgTimePerRequest;

    const hours = Math.floor(estimatedSeconds / 3600);
    const minutes = Math.floor((estimatedSeconds % 3600) / 60);
    const seconds = Math.floor(estimatedSeconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // ✅ FIXED FUNCTION URL
  const processUsername = async (username: string, signal: AbortSignal): Promise<ProfileResult> => {
    try {
      const functionUrl = import.meta.env.VITE_SUPABASE_URL.replace(
        ".supabase.co",
        ".functions.supabase.co"
      ) + "/instagram-scraper";

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ username }),
        signal,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          username,
          post_date: `Error: ${data.error || "API Error"}`,
          error: true,
          processed: true,
        };
      }

      return {
        username,
        post_date: data.post_date || "N/A",
        error: data.error || false,
        processed: true,
      };
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw error;
      }

      return {
        username,
        post_date: `Error: ${error.message}`,
        error: true,
        processed: true,
      };
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const startVerification = async () => {
    if (usernames.length === 0) {
      alert('No usernames to check');
      return;
    }

    if (minDelay > maxDelay) {
      alert('Min delay cannot be greater than max delay.');
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsProcessing(true);
    setStartTime(Date.now());

    if (!resumeSession) {
      setResults([]);
      setProgress({ current: 0, total: usernames.length, percentage: 0 });
      localStorage.removeItem('instagram_scraper_progress');
      localStorage.removeItem('instagram_scraper_results');
    }

    const startIndex = resumeSession ? progress.current : 0;
    const newResults = [...results];

    try {
      for (let i = startIndex; i < usernames.length; i++) {
        if (controller.signal.aborted) break;

        const username = usernames[i];
        setStatus(`Processing: ${username} (${i + 1}/${usernames.length})`);

        const result = await processUsername(username, controller.signal);
        newResults.push(result);
        setResults([...newResults]);

        const currentProgress = {
          current: i + 1,
          total: usernames.length,
          percentage: Math.round(((i + 1) / usernames.length) * 100),
          estimatedTime: calculateEstimatedTime(i + 1, usernames.length),
        };
        setProgress(currentProgress);

        if ((i + 1) % 10 === 0) {
          localStorage.setItem('instagram_scraper_progress', JSON.stringify(currentProgress));
          localStorage.setItem('instagram_scraper_results', JSON.stringify(newResults));
        }

        if (i < usernames.length - 1) {
          const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          await sleep(delay * 1000);
        }
      }

      if (!controller.signal.aborted) {
        setStatus(`Completed: ${newResults.length} profiles checked.`);
        localStorage.removeItem('instagram_scraper_progress');
        localStorage.removeItem('instagram_scraper_results');
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        setStatus(`Error: ${error.message}`);
      }
    } finally {
      setIsProcessing(false);
      setAbortController(null);
    }
  };

  const stopVerification = () => {
    if (abortController) {
      abortController.abort();
      setStatus('Stopping...');
      saveProgress();
    }
  };

  const exportResults = () => {
    if (results.length === 0) {
      alert('No results to export');
      return;
    }

    const csvContent = [
      ['Username', 'Post Date'].join(','),
      ...results.map(result => [result.username, result.post_date].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `instagram_results_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-safe">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white p-4 md:p-6 sticky top-0 z-10 shadow-lg">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Smartphone className="w-6 h-6" />
            <span className="text-sm opacity-90">Mobile Optimized</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            Instagram Profile Post Date Checker
          </h1>
          <p className="text-sm md:text-base opacity-90">
            Check the latest post dates of Instagram profiles
          </p>
        </div>
      </div>

      {/* ... rest of your JSX unchanged ... */}
    </div>
  );
}

export default App;
