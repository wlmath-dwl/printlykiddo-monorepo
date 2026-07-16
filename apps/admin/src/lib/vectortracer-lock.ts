let vectorTracerQueue = Promise.resolve();

export async function runVectorTracerSerially<T>(task: () => Promise<T>) {
  const nextTask = vectorTracerQueue.then(task, task);
  vectorTracerQueue = nextTask.then(
    () => undefined,
    () => undefined,
  );
  return nextTask;
}
