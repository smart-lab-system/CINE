

// User function Template for Java

class Solution {
    // Function to check whether a Binary Tree is BST or not.
    boolean isBST(Node root) {
        // code here.
        return isbstutil(root,Long.MIN_VALUE,Long.MAX_VALUE);
    }
    private boolean isbstutil(Node node,long min,long max){
        if(node==null) return true;
        if(node.data<=min||node.data>=max) return false;
        return isbstutil(node.left,min,node.data ) && isbstutil(node.right,node.data,max);
    }
}