import React, { useState, useEffect } from "react";
import api from "../services/api";
import { format } from "date-fns";

interface ParsedSet {
  muscle_name: string;
  exercise_name: string;
  value: string;
  measurement: string;
  is_completed: boolean;
}

interface ParsedFitbit {
  calories: number;
  heart_rate_avg: number;
  duration_ms: number;
  activity_name: string;
  azm_fat_burn: number;
  azm_cardio: number;
  azm_peak: number;
}

interface TestEvent {
  id: string;
  start: string;
  summary: string;
  raw_description: string;
  parsed_sets: ParsedSet[];
  parsed_fitbit: ParsedFitbit | null;
}

const ParserTest: React.FC = () => {
  const [events, setEvents] = useState<TestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await api.get("/workouts/test-parse");
        setEvents(Array.isArray(response.data) ? response.data : []);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Failed to fetch test data");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  if (loading)
    return <div className="p-8 text-white">Loading test data...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold text-white mb-4">Parser Testing UI</h1>
      <p className="text-gray-400">
        Review how calendar descriptions are currently parsed. You can use this
        to identify format issues.
      </p>

      <div className="space-y-8">
        {events.map((event) => (
          <div
            key={event.id}
            className="bg-gray-800 p-6 rounded-2xl border border-gray-700/50 flex flex-col md:flex-row gap-6"
          >
            {/* Raw Data */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">
                  {event.summary}
                </h2>
                <span className="text-sm text-gray-400">
                  {event.start
                    ? format(new Date(event.start), "MMM d, yyyy")
                    : "No Date"}
                </span>
              </div>
              <div className="bg-gray-900 p-4 rounded-xl border border-gray-700 whitespace-pre-wrap font-mono text-sm text-gray-300">
                {event.raw_description || "<Empty Description>"}
              </div>
            </div>

            {/* Parsed Result */}
            <div className="flex-1 space-y-4">
              <h3 className="text-lg font-medium text-white">Parsed Result</h3>

              {/* Fitbit Data */}
              {event.parsed_fitbit && (
                <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl">
                  <h4 className="text-sm font-semibold text-blue-400 mb-2">
                    Fitbit Data
                  </h4>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>Activity: {event.parsed_fitbit.activity_name}</li>
                    <li>Calories: {event.parsed_fitbit.calories} kcal</li>
                    <li>
                      Duration:{" "}
                      {Math.floor(event.parsed_fitbit.duration_ms / 60000)} min
                    </li>
                  </ul>
                </div>
              )}

              {/* Exercises Data */}
              <div className="bg-gray-900 p-4 rounded-xl border border-gray-700">
                <h4 className="text-sm font-semibold text-gray-400 mb-3">
                  Exercises ({event.parsed_sets.length} sets total)
                </h4>
                {event.parsed_sets.length > 0 ? (
                  <ul className="space-y-2">
                    {(() => {
                      const grouped = new Map<
                        string,
                        {
                          completed: boolean;
                          muscle: string;
                          exercise: string;
                          measures: Record<string, string[]>;
                        }
                      >();

                      event.parsed_sets.forEach((set) => {
                        const key = `${set.muscle_name}-${set.exercise_name}`;
                        if (!grouped.has(key)) {
                          grouped.set(key, {
                            completed: set.is_completed,
                            muscle: set.muscle_name,
                            exercise: set.exercise_name,
                            measures: {},
                          });
                        }
                        const entry = grouped.get(key)!;
                        if (set.is_completed) entry.completed = true;

                        if (!entry.measures[set.measurement]) {
                          entry.measures[set.measurement] = [];
                        }
                        entry.measures[set.measurement].push(set.value);
                      });

                      return Array.from(grouped.values()).map((ex, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-gray-300 flex items-center justify-between bg-gray-800 p-2 rounded"
                        >
                          <span>
                            {ex.completed && (
                              <span className="text-green-400 mr-2">✅</span>
                            )}
                            <span className="font-semibold text-white capitalize">
                              {ex.muscle}
                            </span>{" "}
                            - <span className="capitalize">{ex.exercise}</span>
                          </span>
                          <div className="flex gap-1">
                            {Object.entries(ex.measures).map(
                              ([meas, vals], i) => (
                                <span
                                  key={i}
                                  className="bg-gray-700 px-2 py-1 rounded text-xs font-mono"
                                >
                                  {vals.join("-")}
                                  {meas}
                                </span>
                              ),
                            )}
                          </div>
                        </li>
                      ));
                    })()}
                  </ul>
                ) : (
                  <p className="text-sm text-yellow-500">
                    No sets parsed from description. (Might be a rest day or
                    cardio only)
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParserTest;
