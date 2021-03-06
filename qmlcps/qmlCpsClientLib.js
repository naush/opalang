/*
    Copyright © 2011 MLstate

    This file is part of OPA.

    OPA is free software: you can redistribute it and/or modify it under the
    terms of the GNU Affero General Public License, version 3, as published by
    the Free Software Foundation.

    OPA is distributed in the hope that it will be useful, but WITHOUT ANY
    WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
    FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for
    more details.

    You should have received a copy of the GNU Affero General Public License
    along with OPA.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
   Client-side library for JavaScript compilation in CPS mode.

   Some of the functions here are made accessible to the user and/or the compiler through the BSL (see bslCps.js ).

   @author Maxime Audouin <maxime.audouin@mlstate.com>
   @author Rudy Sicard
   @author David Rajchenbach-Teller (clean-up, documentation, review -- Aug 24th, 2010)
*/

/**
 * {1 Debugging}
 */

/**
 * A function provided for convenience when debugging the compiler.
 * Unless you're debugging the CPS parts of the JS compiler, you shouldn't need this function.
 *
 * By default, the function does nothing. Change the body of the function to make it dump
 * information to appropriate places.
 */
function cps_debug(s){
    js_debug("[CPS]"+s);
    return js_void; // FIXME: this return js_void is probably deprecated
}

/**
 * An assertion function provided for convenience when debugging the compiler.
 * Unless you're debugging the CPS parts of the JS compiler, you shouldn't need this function.
 *
 * Check a condition. If the condition is [false], raise an [Error] with a given debugging message.
 *
 * @param b A boolean condition. If it is [false], this is a fatal error, execution will stop.
 * @param s A debugging message.
 */
var cps_assert = js_assert

/**
 * {1 Scheduling}
 */



/**
 * {2 Synchronization barriers}
 *
 * Barriers support two operations: [wait] adds a continuation, waiting for the barrier to be released,
 * while [release] releases the barrier and sets a value which the waiting continuations can obtain.
 */

//DEBUG START
var created_barriers = [];
var released_barriers= [];
/*cps_debug_create_barrier = function(s)
{
    created_barriers.push(s);
}
function cps_debug_release_barrier(s)
{
    released_barriers.push(s);
}*/
//DEBUG END

/**
 * Create a synchronization barrier.
 * See prototype.
 *
 * @param {(number|string)=} name An optional name, used for debugging purposes
 * @constructor
 */
function Barrier(name)
{
    this._waiters = [];
//DEBUG START
    if(name == null)
        this._id = Math.random();
    else
        this._id = name;
    cps_debug("[Barrier] Creating barrier "+this._id);
    created_barriers.push(this._id);
//DEBUG END
}

Barrier.prototype = {
    /**
     * Determine if the barrier has been released already. [true] if the barrier has been
     * released, [false] otherwise.
     *
     * @type {boolean}
     */
    _is_computed: false,

    /**
     * The result of the computation. [null] until the barrier has been released, not-[null]
     * otherwise.
     *
     * @type {?Object}
     */
    _result:      null,

    /**
     * An array of [Continuation]s
     *
     * @type {Array.<Continuation>}
     */
    _waiters:     null,

    /**
     * Release the barrier.
     *
     * Schedule all continuations waiting on this barrier. Can be called only once on a given barrier.
     *
     * @param {!Object} result A result
     */
    release: function(result)
    {
        cps_assert(result != null, "[Barrier.release] invoked on [null] result");
        cps_assert(!this._is_computed, "[Barrier.release] invoked on already released barrier");
        cps_debug("[Barrier.release] Releasing barrier "+this._id);
        //DEBUG START
        released_barriers.push(this._id);
        //DEBUG STOP
        this._is_computed = true;
        this._result      = result;
        var waiters       = this._waiters;
        var len           = waiters.length;
        var i;
        for(i = 0; i < len; ++i)
        {
            var k      = waiters[i];
            k.execute1(result);
        }
        this._waiters = undefined;
    },

    /**
     * Add a continuation waiting for this barrier.
     *
     * If the barrier is already released, the task is immediately executed. Otherwise, it
     * will wait until [release] is called.
     *
     * @param {Continuation} k A continuation
     */
    wait: function(k)
    {
        cps_assert(k instanceof Continuation, "[Barrier.wait] expects a [Continuation]")
        if(this._is_computed)
        {
            k._payload(this._result);
        } else {
            this._waiters.push(k);
        }
    }
}


/**
 * {2 Tasks}
 */

/**
 * The interface of tasks.
 *
 * @interface
 */
function Task() {}
Task.prototype = {
    debug_is_a_task: true,
    go: function() {cps_assert(false, "Attempting to call a purely virtual method")}
}


/**
 * Construct a new task from a 0-argument function
 *
 * @param thunk a 0 argument function to be executed once the scheduler wakes up the task
 *
 * Note: Some browsers may actually pass arguments to [thunk]. Ignore them.
 *
 * @constructor
 * @implements {Task}
 */
function Task_from_thunk(thunk) {
    this._thunk   = thunk;
    this._barrier = new Barrier();
}

Task_from_thunk.prototype = {
    debug_is_a_task: true,//Used for assertion checks
    go: function()
    {
        var result = this._thunk();
        this._barrier.release(result);
    }
}

/**
 * Create a [Task] for an expression executed with a [spawn].
 *
 * By opposition to [Task_from_thunk] or [Task_from_application], this brand of [Task] does not
 * release its barrier automatically.
 *
 *
 * @param {!Function} f
 * @constructor
 * @implements {Task}
 */
function Task_from_spawn(f) {
    this._barrier = new Barrier("Task_from_spawn "+Math.random());
    this._thunk   = f;
}
Task_from_spawn.prototype = {
    _thunk:          null,
    debug_is_a_task: true,//Used for assertion checks
    go: function()
    {
        cps_debug("[Task_from_spawn.go]: "+this._thunk);
        if(this._note != null)
            cps_debug(this._note)
        else
            cps_debug("[spawn] regular task");
        var barrier= this._barrier;
        var k      = new Continuation(barrier.release, barrier, null);
        var result = this._thunk(js_void, k);
    }
}

/**
 * Construct a new task from an application, i.e. a function and its arguments
 *
 * @param fun a function to be executed once the scheduler wakes up the task
 * @param args the arguments to pass to the function
 *
 * Note: Some browsers may actually pass additional arguments to [fun]. Ignore them.
 * @constructor
 * @implements {Task}
 */
function Task_from_application(fun, args) {
    this._fun     = fun;
    this._args    = args;
    this._barrier = new Barrier();
}

Task_from_application.prototype = {
    debug_is_a_task: true,//Used for assertion checks
    go: function()
    {
        var result = this._fun(this._args);
        this._barrier.release(result);
    }
}

/**
 * @param {!Continuation} k
 * @param {Array.<!*>} args
 * @constructor
 * @implements Task
 */
function Task_from_return(k, args)
{
    cps_assert(k instanceof Continuation, "[Task_from_return] attempting to pass non-continuation "+k);
    this._cont    = k;
    this._args    = args;
}
Task_from_return.prototype = {
    debug_is_a_task: true,//Used for assertion checks
    go: function()
    {
        this._cont.execute(this._args);
    }
}

/**
 * Construct a continuation.
 *
 * Once it has received its argument, a continuation may decide to [push] a [Task] or possibly
 * to execute some treatment.
 *
 * @param {!Function} payload a 1-argument function
 * @param {?Object=}  context an optional object containing the execution context for [payload]
 * @param {?Object=}  options placeholder for future passing of continuation options, must be [null] for the moment.
 * @constructor
 *///TODO reintroduce options
function Continuation(payload, context, options) {
    cps_assert(payload instanceof Function, "[Continuation] can only be constructed from functions");
    cps_assert(options == null, "[Continuation] doesn't handle options for the moment");
    this._payload = payload;
    this._context = context;
    this._options = options;
    if(context == null)//optimized execute1
        this.execute1 = this._execute1
}
Continuation.prototype = {
    _payload: null,
    _context: null,
    _options: null,
    /**
     * Apply a continuation to an array of arguments
     *
     * @param {?Array} args a possibly empty, possibly [null] array of arguments to pass to the continuation
     */
    execute: function(args) {
        return this._payload.apply(this._context, args)
    },
    /**
     * Non-optimized version of [apply] for exactly one argument.
     *
     * Transparently replaced by optimized version when possible (i.e. when context is [null]).
     */
    execute1: function(arg) {
        return this._payload.apply(this._context, [arg]);
    },
    /**
     * Optimized version of [execute1].
     *
     * Do not call directly.
     */
    _execute1: function(arg) {
        cps_assert(this._context == null, "[Continuation._execute1] called with non-null context");
        return this._payload(arg);
    }
}



/**
 * {2 The scheduling loop}
 */

/**
 * A queue of tasks waiting to be executed
 */
var ready = [];

/**
 * Schedule a [Task] for future execution.
 *
 * @param {Task} task
 */
function push(task)
{
    cps_assert(task.debug_is_a_task, "[push] expects a [Task]");
    ready.push(task);
}

/**
 * An infinite scheduling loop.
 *
 * Takes the tasks waiting in [ready], execute them. If [ready] is empty, sleep and wake up
 *
 * Stop on fatal error.
 */
function schedule_aux()
{
    cps_debug("Entering scheduling outer loop");
    var i;
    var fatal_error   = false;//[true] if we stopped scheduling because of a fatal error, [false] otherwise
    var nothing_to_do = false;//[true] if we stopped scheduling because there's nothing left to do
    var tasks         = ready;//Keep a local copy. In most JS VMs, this will speed-up code.
    var task;
    try
    {
        for(;;)
        {
            cps_debug("Entering scheduling inner loop");
            if(tasks.length == 0)
            {
                nothing_to_do = true;
                break;
            } else {
                task = tasks.shift();
                cps_assert(task.debug_is_a_task, "[schedule] expects [ready] to contain [Task]s");
                tailcall_manager_call(task.go, task);//Execute trampolined code
                // In CPS, we can very likely get away without the tail-call manager.
                // However, the compiler doesn't know whether we are in CPS, so always produces code
                // meant for use with the tail-call manager
                // If/when we move to full CPS, simplify this.
            }
        }
    } catch(e) {
        fatal_error = true;
        cps_debug(e);
    }
}

function command_line_schedule_aux()
{
    cps_debug("Entering scheduling outer loop");
    var i;
    var fatal_error   = false;//[true] if we stopped scheduling because of a fatal error, [false] otherwise
    var nothing_to_do = false;//[true] if we stopped scheduling because there's nothing left to do
    var tasks         = ready;//Keep a local copy. In most JS VMs, this will speed-up code.
    var task;
    var iterations_between_settimeout = 100;
    var wait_delay_nothing_to_do      = 50;//Default wait delay when there's nothing to do. We could increase it progressively.
    var wait_delay_something_to_do    = 10;//Default wait delay when there's something left to do. Cannot be much lower, otherwise some browsers will ignore it.
    try
    {
        while(true)
        {
            cps_debug("Entering scheduling inner loop");
            if(tasks.length == 0)
            {
                nothing_to_do = true;
                break;
            } else {
                task = tasks.shift();
                cps_assert(task.debug_is_a_task, "[schedule] expects [ready] to contain [Task]s");
                tailcall_manager_call(task.go, task);//Execute trampolined code
                // In CPS, we can very likely get away without the tail-call manager.
                // However, the compiler doesn't know whether we are in CPS, so always produces code
                // meant for use with the tail-call manager
                // If/when we move to full CPS, simplify this.
            }
        }
    } catch(e) {
        fatal_error = true;
        cps_debug(e);
    }
}

var schedule;
if(!command_line_execution)
{
        schedule = schedule_aux
} else {
        schedule = command_line_schedule_aux
}

function loop_schedule() {
    schedule()
}//TODO: Get rid of this

/**
 * Returns value [x] to Continuation [k].
 */
function return_(k, x){
    cps_assert(arguments.length == 2, "[return_] expects 2 arguments");
    cps_assert(k instanceof Continuation, "[return_] expects a [Continuation]");
    cps_debug("[return_] starting, with "+k+", "+x);
    push (new Task_from_return(k, [x]));
}

function execute(k, x){
    k.execute1(x);
}

/**
 * Compute a function application in a given continuation.
 *
 * @param f A function accepting one argument (and a continuation)
 * @param v The argument to function [f]
 * @param k The continuation expeccting the result of [f(v)]
 */
function cps_apply(f, v, k){
    // TODO: decide whether we always [push]
    push(new Task_from_application(f, [v, k] ));
}




/**
 * Blocking wait for a barrier to be [release]d
 *
 * Execute all tasks until said barrier has been released. Fail if there are no more tasks
 * and the barrier is still not released. Does not yield time with setTimeout.
 */
function blocking_wait(barrier){
    var i;
    var task;
    while(!barrier._is_computed)
    {
        cps_debug("[Schedule] Entering blocking wait outer loop");
        //DEBUG START
        if(ready.length == 0)
        {
            cps_debug("[Schedule] nothing left to do");
            var remaining_barriers = [];
            for(i = 0; i < created_barriers.length; ++i)
            {
                if(released_barriers.indexOf(created_barriers[i]) == -1)
                    remaining_barriers.push(created_barriers[i]);
            }
            cps_assert(ready.length != 0, "[Schedule] Nothing to do. The following barriers are still closed: "+remaining_barriers);
        }
        //DEBUG END
        //cps_assert(ready.length != 0, "[Schedule] Nothing to do.");
        task = ready.shift();
        cps_assert(task.debug_is_a_task, "[Schedule] [blocking wait] expects [ready] to contain [Task]s");
        tailcall_manager_call(task.go, task);//Execute trampolined code
    }
    return barrier._result;
}

function spawn(f) {
    var task = new Task_from_spawn(f);
    task._note = "[spawn] This task has been spawned"
    push(task);
    return task._barrier;
}


function main(f)
{
    return spawn(f);
}


var default_options = {movable:true, atomic:false, lazy:false};
var default_thread_context = {none:js_void};
