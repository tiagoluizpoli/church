# Throwaway: WeasyPrint render time in a long-lived Python process (no interpreter start-up per PDF).
# docker run --rm -v $PWD:/w -w /w bench-weasyprint python weasy-inproc.py
import resource, time
from weasyprint import HTML
times = []
for i in range(10):
    t = time.perf_counter()
    HTML("schedule.html").write_pdf(f"/tmp/o{i}.pdf")
    times.append((time.perf_counter() - t) * 1000)
print(f"weasy in-process first_ms={times[0]:.0f} warm_p50_ms={sorted(times[1:])[4]:.0f} maxrss_mb={resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024:.0f}")
