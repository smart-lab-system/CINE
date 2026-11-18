

// FUNCTION CODE
/* A Binary Tree node
class Node
{
    int data;
    Node left, right;
   Node(int item)    {
        data = item;
        left = right = null;
    }
} */

/* Should return minimum distance between a and b
   in a tree with given root*/
   class GfG {
    private HashMap<Node, Node> parent = new HashMap<>();
    private int ans = 0;

    private void mapParent(Node root, Node[] targets, int first, int second){
        Queue<Node> q = new LinkedList<>();
        q.add(root);

        while(!q.isEmpty()){
            Node curr = q.poll();

            if(curr.data == first) targets[0] = curr;
            if(curr.data == second) targets[1] = curr;

            if(curr.left != null){
                parent.put(curr.left, curr);
                q.add(curr.left);
            }
            if(curr.right != null){
                parent.put(curr.right, curr);
                q.add(curr.right);
            }
        }
    }

    private void solve(Node root, Node tNode, Map<Node, Boolean> vis, int count){
        if(root == null)    return;
        if(root.data == tNode.data){
            ans = count;
            return;
        }
        vis.put(root, true);
        count++;

        if(root.left != null && !vis.getOrDefault(root.left, false))
            solve(root.left, tNode, vis, count);
        if(root.right != null && !vis.getOrDefault(root.right, false))
            solve(root.right, tNode, vis, count);
        if(parent.containsKey(root) && !vis.getOrDefault(parent.get(root), false))
            solve(parent.get(root), tNode, vis, count);

        vis.put(root, false);
        count--;
    }
    int findDist(Node root, int a, int b) {
        // Your code here
         Node[] targets = new Node[2];
        mapParent(root, targets, a, b);

        Map<Node, Boolean> vis = new HashMap<>();
        int count = 0;
        solve(targets[0], targets[1], vis, count);
        return ans;
    }
}