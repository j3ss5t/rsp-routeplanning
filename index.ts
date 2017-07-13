import { BehaviorSubject, Subject } from '@reactivex/rxjs';
import * as uuid from "uuid";
import { rsiLogger } from "../../log";

import { Service, Resource, Element, ResourceUpdate, StatusCode, ElementResponse, CollectionResponse } from "../rsiPlugin";
import { RouteObject, RoutePolicyObject } from "./schema";

import { createClient, GoogleMapsClient } from '@google/maps';

class RoutePlanning extends Service {
  constructor() {
    super();
    this.id = "f9a1073f-e91f-8f56-8468-f4d6bd1d8c96"; //random id
    this.resources.push(new Routes(this));
    this.resources.push(new RoutePolicies(this));
  }
}

interface RouteElement extends Element {
  data: RouteObject;
}

class Routes implements Resource {
  private _name: string;
  private _routes: BehaviorSubject<RouteElement>[] = [];
  private _change: BehaviorSubject<ResourceUpdate>;
  private _logger = rsiLogger.getInstance().getLogger("routeplanning");
  private googleClient: GoogleMapsClient;

  constructor(private service: Service) {
    this._change = new BehaviorSubject(<ResourceUpdate>{ lastUpdate: Date.now(), action: 'init' });
    this.googleClient = createClient({
      key: 'AIzaSyCmx-uogQJpnUdB8RcRPZO6K0rxfZKeYIc',
    });
  }

  get name(): string {
    return this.constructor.name;
  };

  directAddress(request: google.maps.DirectionsRequest): Promise<google.maps.DirectionsResult> {
    return new Promise<google.maps.DirectionsResult>((resolve, reject) => {
      this.googleClient.directions(request, (error, response) => {
        if (error) {
          reject(error);
        }

        resolve(response.json);
      });
    });
  };

  get elementSubscribable(): Boolean {
    return true;
  };

  get change(): BehaviorSubject<ResourceUpdate> {
    return this._change;
  }

  getElement(elementId: string): ElementResponse {
    // find the element requested by the client
    return {
      status: "ok",
      data: this._routes.find((element: BehaviorSubject<RouteElement>) => {
        return (<{ id: string }>element.getValue().data).id === elementId;
      })
    };
  };

  getResource(offset?: string | number, limit?: string | number): CollectionResponse {
    // retriev all element
    let resp: BehaviorSubject<RouteElement>[];

    if ((typeof offset === "number" && typeof limit === "number") || (typeof limit === "number" && !offset) || (typeof offset === "number" && !limit) || (!offset && !limit)) {
      resp = this._routes.slice(<number>offset, <number>limit);
    }

    return { status: "ok", data: resp };
  };

  createElement(state: any): ElementResponse {
    if (!state.name) return {
      status: "error",
      error: new Error('providing a name is mandatory'),
      code: StatusCode.INTERNAL_SERVER_ERROR
    };

    if (!state.destination) return {
      status: "error",
      error: new Error('providing a destination is mandatory'),
      code: StatusCode.INTERNAL_SERVER_ERROR
    };

    if (!state.destination.name) return {
      status: "error",
      error: new Error('providing a destination.name is mandatory'),
      code: StatusCode.INTERNAL_SERVER_ERROR
    };

    const routeId = uuid.v1();

    /** build the actual location and add it to the collections*/
    let newRoute = new BehaviorSubject<RouteElement>(
      {
        lastUpdate: Date.now(),
        propertiesChanged: [],
        data: {
          uri: "/" + this.service.name.toLowerCase() + "/" + this.name.toLowerCase() + "/" + routeId,
          id: routeId,
          name: state.name,
          destination: state.destination,
          origin: state.origin,
        }
      });
    this._routes.push(newRoute);

    /** publish a resource change */
    this._change.next({ lastUpdate: Date.now(), action: "add" });

    const request: google.maps.DirectionsRequest = {
      destination: state.destination.name,
      origin: state.origin.name,
    };

    this.directAddress(request).then((result) => {
      if(result.routes.length >= 1) {
        let route: RouteElement = newRoute.getValue();
        let googleRoute = result.routes[0];
        let newId = uuid.v1();

        route.data.consumingTime = googleRoute.legs[0].duration.text;
        route.data.distance = googleRoute.legs[0].distance.text;
        route.data.path = (<any>googleRoute.overview_polyline).points;

        newRoute.next(
          {
            lastUpdate: Date.now(),
            propertiesChanged: ["consumingTime", "distance", "path"],
            data: route.data
          });
      }
    }).catch((error) => {
      console.log("Error: " + error);
    });

    /** return success */
    return { status: "ok", data: newRoute };
  };
}

interface RoutePolicyElement extends Element {
  data: RoutePolicyObject;
}

class RoutePolicies implements Resource {
  private _name: string;
  private _policies: BehaviorSubject<RoutePolicyElement>[] = [];
  private _change: BehaviorSubject<ResourceUpdate>;
  private _logger = rsiLogger.getInstance().getLogger("routeplanning");

  constructor(private service: Service) {
    let fastestPolicyId = uuid.v1();
    let fastestPolicy = new BehaviorSubject<RoutePolicyElement>({
      lastUpdate: Date.now(),
      propertiesChanged: [],
      data: {
        uri: "/" + this.service.name.toLowerCase() + "/" + this.name.toLowerCase() + "/" + fastestPolicyId,
        id: fastestPolicyId,
        name: "fastest"
      }
    });
    this._policies.push(fastestPolicy);

    let shortestPolicyId = uuid.v1();
    let shortestPolicy = new BehaviorSubject<RoutePolicyElement>({
      lastUpdate: Date.now(),
      propertiesChanged: [],
      data: {
        uri: "/" + this.service.name.toLowerCase() + "/" + this.name.toLowerCase() + "/" + shortestPolicyId,
        id: shortestPolicyId,
        name: "shortest"
      }
    });
    this._policies.push(shortestPolicy);

    this._change = new BehaviorSubject(<ResourceUpdate>{ lastUpdate: Date.now(), action: 'init' });
  }

  get name(): string {
    return this.constructor.name;
  };

  get elementSubscribable(): Boolean {
    return true;
  };

  get change(): BehaviorSubject<ResourceUpdate> {
    return this._change;
  }

  getElement(elementId: string): ElementResponse {
    // find the element requested by the client
    return {
      status: "ok",
      data: this._policies.find((element: BehaviorSubject<RoutePolicyElement>) => {
        return (<{ id: string }>element.getValue().data).id === elementId;
      })
    };
  };

  getResource(offset?: string | number, limit?: string | number): CollectionResponse {
    // retriev all element
    let resp: BehaviorSubject<RoutePolicyElement>[];

    if ((typeof offset === "number" && typeof limit === "number") || (typeof limit === "number" && !offset) || (typeof offset === "number" && !limit) || (!offset && !limit)) {
      resp = this._policies.slice(<number>offset, <number>limit);
    }

    return { status: "ok", data: resp };
  };
}

export {RoutePlanning as Service};
