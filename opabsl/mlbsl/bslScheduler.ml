(*
    Copyright © 2011 MLstate

    This file is part of OPA.

    OPA is free software: you can redistribute it and/or modify it under the
    terms of the GNU Affero General Public License, version 3, as published by
    the Free Software Foundation.

    OPA is distributed in the hope that it will be useful, but WITHOUT ANY
    WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
    FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for
    more details.

    You should have received a copy of the GNU Affero General Public License
    along with OPA. If not, see <http://www.gnu.org/licenses/>.
*)
let opa = Scheduler.default

let push f = Scheduler.push opa f

let at_exit f = Scheduler.at_exit opa f

let asleep t f =
  Scheduler.sleep opa (Time.milliseconds t) f

let sleep t f = ignore(asleep t f)

let timer t f = Scheduler.timer opa (Time.milliseconds t) f

let abort a = Scheduler.abort opa a


(* BSL REGISTERING *)
##register sleep : int, (-> void) -> void

##register [cps-bypass] sleep_cps : int, (continuation(opa[void]) -> void), continuation(opa[void]) -> void
let sleep_cps t f k =
  sleep t (BslUtils.proj_cps0 k f);
  QmlCpsServerLib.return k ServerLib.void


##register timer : int, (-> void) -> void

##register [cps-bypass] timer_cps : int, (continuation(opa[void]) -> void), continuation(opa[void]) -> void
let timer_cps t f k =
  timer t (BslUtils.proj_cps0 k f);
  QmlCpsServerLib.return k ServerLib.void


##register push : (-> void) -> void

##register [cps-bypass] push_cps : (continuation(opa[void]) -> void), continuation(opa[void]) -> void
let push_cps f k =
  push (BslUtils.proj_cps0 k f);
  QmlCpsServerLib.return k ServerLib.void

##register at_exit : (-> void) -> void

##register [cps-bypass] at_exit_cps : (continuation(opa[void]) -> void), continuation(opa[void]) -> void
let at_exit_cps f k =
  at_exit (BslUtils.proj_cps0 k f);
  QmlCpsServerLib.return k ServerLib.void

##register finalize : ('a -> void), 'a -> void
let finalize f v = Scheduler.finalise opa f v

##register [cps-bypass] finalize_cps : (opa['a], continuation(opa[void]) -> void), opa['a], continuation(opa[void]) -> void
let finalize_cps f v k =
  finalize (BslUtils.proj_cps k f) v;
  QmlCpsServerLib.return k ServerLib.void
