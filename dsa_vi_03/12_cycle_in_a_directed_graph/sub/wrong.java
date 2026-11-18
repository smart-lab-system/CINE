

/*Complete the function below*/

class Solution {
    // Function to detect cycle in a directed graph.
    public boolean isCyclic(ArrayList<ArrayList<Integer>> adj) {
        // code here
        boolean []vis = new boolean[adj.size()];
        Queue<Integer>q = new LinkedList<>();
        q.add(0);
        vis[0]=true;
        while(q.size()>0){
            int rem = q.remove();
            ArrayList<Integer>temp = adj.get(rem);
            for(int t:temp){
                if(t==rem){
                    return true;
                }
                if(!vis[t] && t!=rem){
                    vis[t]=true;
                    q.add(t);
                }
            }
        }
        return false;
    }
}