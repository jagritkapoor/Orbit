import { registry } from "./TagRegistry";
import { listProcessor } from "./list/ListProcessor";
import { mathProcessor } from "./math/MathProcessor";
import { timerProcessor } from "./timer/TimerProcessor";

registry.register(listProcessor);
registry.register(mathProcessor);
registry.register(timerProcessor);

export { registry, listProcessor };
