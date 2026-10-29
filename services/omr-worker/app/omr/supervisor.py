"""Native decoders run in disposable, time/memory-bounded child processes."""
import multiprocessing
import os
import threading

SLOTS = threading.BoundedSemaphore(2)


class WorkerBusy(RuntimeError):
    pass


def _child(connection, operation, args):
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (3 * 1024**3, 3 * 1024**3))
        resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
        os.environ["OPENBLAS_NUM_THREADS"] = "1"
        os.environ["OMP_NUM_THREADS"] = "1"
        import cv2
        cv2.setNumThreads(1)
        if operation == "process":
            from .pipeline import process_batch
            result = process_batch(args)
        else:
            from .pdf_generator import generate_pdf
            from .template_manager import TemplateSpec
            args = dict(args)
            spec = TemplateSpec(args.pop("questionCount"), args.pop("choiceCount"))
            result = generate_pdf(spec=spec, **args)
        connection.send((True, result))
    except Exception:
        # Decoder errors must not include uploaded content, paths or identifiers.
        connection.send((False, "PROCESSING_FAILED"))
    finally:
        connection.close()


def run_bounded(operation, args, timeout=90):
    if not SLOTS.acquire(blocking=False):
        raise WorkerBusy("WORKER_BUSY")
    context = multiprocessing.get_context("spawn")
    parent, child = context.Pipe(duplex=False)
    process = context.Process(target=_child, args=(child, operation, args), daemon=True)
    try:
        process.start()
        child.close()
        if not parent.poll(timeout):
            raise RuntimeError("PROCESSING_TIMEOUT")
        try:
            ok, result = parent.recv()
        except EOFError as exc:
            raise RuntimeError("PROCESSING_FAILED") from exc
        if not ok:
            raise RuntimeError(result)
        return result
    finally:
        if process.pid:
            process.join(timeout=1)
            if process.is_alive():
                process.terminate()
                process.join(timeout=3)
            if process.is_alive():
                process.kill()
                process.join()
        parent.close()
        child.close()
        SLOTS.release()
